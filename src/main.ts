import { ErrorMapper } from "utils/ErrorMapper";
import { updateStats } from "utils/stats";
import { evaluateTask } from "tasks/evaluator";
import { runTask } from "tasks/runner";
import { clearDistanceCache, runSpawner } from "spawner";
import { computeExtensionPlan, ensureSourceContainerSites, placeExtensionSites } from "tasks/build";

const DISTANCE_CACHE_CLEAR_INTERVAL = 1000;
const REPAIR_THRESHOLD = 0.75;

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(`Current game tick is ${Game.time}`);

  // Periodically clear the distance cache to prevent unbounded memory growth.
  if (Game.time % DISTANCE_CACHE_CLEAR_INTERVAL === 0) {
    clearDistanceCache();
  }

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  updateStats();
  runSpawner();

  // Re-compute extension plan when RCL advances or plan is missing.
  // PathFinder runs here (once per RCL change), never inside the per-creep loop.
  if (Memory.extensionPlan == null) Memory.extensionPlan = {};
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (room.controller == null) continue;
    const stored = Memory.extensionPlan[roomName];
    if (stored == null || stored.rcl !== room.controller.level) {
      computeExtensionPlan(room);
    }
    // Ensure source containers and extensions are always queued for construction,
    // even when no creep is currently assigned the "build" task. This guarantees
    // destroyed or missing structures are re-queued unconditionally each tick.
    ensureSourceContainerSites(room);
    placeExtensionSites(room);
  }

  // Pre-compute per-room task counts once per tick (avoids O(N²) per-creep inner loop)
  const roomTaskCounts: Record<string, Partial<Record<string, number>>> = {};
  for (const n in Game.creeps) {
    const c = Game.creeps[n];
    const r = c.memory.room;
    if (r == null) continue;
    if (roomTaskCounts[r] == null) roomTaskCounts[r] = {};
    const t = c.memory.task ?? "idle";
    roomTaskCounts[r][t] = (roomTaskCounts[r][t] ?? 0) + 1;
  }

  // Pre-compute per-room economy targets (one harvester slot per source)
  const roomEconomyTargets: Record<string, number> = {};
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    roomEconomyTargets[roomName] = room.find(FIND_SOURCES).length;
  }

  // Pre-compute per-room repair flags and per-room slot data
  const roomHasRepairTargets: Record<string, boolean> = {};
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    roomHasRepairTargets[roomName] = room.find(FIND_STRUCTURES, {
      filter: (s: AnyStructure) => s.hits < s.hitsMax * REPAIR_THRESHOLD
    }).length > 0;
  }

  // Build repair allocation map from existing creep memory (persisted from last tick).
  // Mutated during the creep loop when new repairTargetIds are assigned this tick.
  const repairAllocations: Record<string, number> = {};
  for (const name in Game.creeps) {
    const id = Game.creeps[name].memory.repairTargetId;
    if (id != null) repairAllocations[id] = (repairAllocations[id] ?? 0) + 1;
  }

  // Pre-compute per-room sourceContainerMap: for each source with an adjacent built container,
  // record the container id and the number of Chebyshev-intersection harvest-deposit tiles.
  const sourceContainerMap: Record<string, SourceContainerInfo> = {};
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    const terrain = room.getTerrain();
    for (const source of room.find(FIND_SOURCES)) {
      const adjacent: AnyStructure[] = source.pos.findInRange(FIND_STRUCTURES, 1);
      const container = adjacent.find(
        (s: AnyStructure) => s.structureType === STRUCTURE_CONTAINER
      ) as StructureContainer | undefined;
      if (container == null) continue;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = source.pos.x + dx;
          const y = source.pos.y + dy;
          if (dx === 0 && dy === 0) continue; // source tile itself
          if (x === container.pos.x && y === container.pos.y) continue; // container tile
          if (x < 0 || x > 49 || y < 0 || y > 49) continue;
          if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
          // Must also be within range 1 of the container (Chebyshev intersection)
          if (Math.max(Math.abs(x - container.pos.x), Math.abs(y - container.pos.y)) <= 1) count++;
        }
      }
      sourceContainerMap[source.id] = {
        containerId: container.id,
        harvestDepositTileCount: count
      };
    }
  }

  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    const taskCounts = roomTaskCounts[creep.memory.room] ?? {};
    const slots: RoomSlots = {
      taskCounts,
      economyTarget: roomEconomyTargets[creep.memory.room] ?? 1,
      hasBuildSites: creep.room?.find != null ? creep.room.find(FIND_CONSTRUCTION_SITES).length > 0 : false,
      hasActiveStationaryUpgrader: (taskCounts.upgradeFromContainer ?? 0) > 0,
      hasRepairTargets: roomHasRepairTargets[creep.memory.room] ?? false
    };
    const ctx: TickContext = { slots, repairAllocations, sourceContainerMap };

    if (creep.memory.task == null) {
      creep.memory.task = evaluateTask(creep, ctx);
    }

    const done = runTask(creep, ctx);
    if (done) {
      // Re-evaluate and immediately execute the new task in the same tick so
      // the creep does not idle for a tick at the source after filling up.
      creep.memory.task = evaluateTask(creep, ctx);
      runTask(creep, ctx);
    }
  }
});
