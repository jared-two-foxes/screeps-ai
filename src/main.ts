import { ErrorMapper } from "utils/ErrorMapper";
import { updateStats } from "utils/stats";
import { evaluateTask } from "tasks/evaluator";
import { runTask } from "tasks/runner";
import { clearDistanceCache, runSpawner } from "spawner";

const DISTANCE_CACHE_CLEAR_INTERVAL = 1000;

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

  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    const taskCounts = roomTaskCounts[creep.memory.room] ?? {};
    const slots = {
      taskCounts,
      economyTarget: 1,
      hasBuildSites: creep.room?.find != null ? creep.room.find(FIND_CONSTRUCTION_SITES).length > 0 : false,
      hasActiveStationaryUpgrader: (taskCounts.upgradeFromContainer ?? 0) > 0
    };

    if (creep.memory.task == null) {
      creep.memory.task = evaluateTask(creep, slots);
    }

    const done = runTask(creep);
    if (done) {
      // Re-evaluate and immediately execute the new task in the same tick so
      // the creep does not idle for a tick at the source after filling up.
      creep.memory.task = evaluateTask(creep, slots);
      runTask(creep);
    }
  }
});
