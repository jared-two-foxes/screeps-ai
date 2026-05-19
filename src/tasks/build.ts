import { canBuildExpansions } from "spawner";
import { computeFleetMaintenanceCost, computeRoomHarvestRate } from "utils/economy";

const WORKER_BODY_COST = 200; // WORK(100) + CARRY(50) + MOVE(50)

const countUpgradersInRoom = (roomName: string): number => {
  let count = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (
      creep.memory.room === roomName &&
      (creep.memory.task === "upgrade" || creep.memory.task === "upgradeFromContainer")
    )
      count++;
  }
  return count;
};


const isValidExtensionTile = (terrain: RoomTerrain, x: number, y: number): boolean => {
  if (x < 1 || x > 48 || y < 1 || y > 48) return false;
  if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
  return true;
};

/**
 * Returns true if placing a blocking structure at (x, y) would still leave
 * a walkable path from the spawn to the given goal position.
 * baseCosts must already include all existing obstacles; the candidate tile
 * is cloned on top so cumulative blocking is correctly accounted for.
 */
const tileKeepsSpawnConnected = (
  spawnPos: RoomPosition,
  goalPos: RoomPosition,
  candidateX: number,
  candidateY: number,
  baseCosts: CostMatrix
): boolean => {
  const result = PathFinder.search(
    spawnPos,
    { pos: goalPos, range: 1 },
    {
      maxRooms: 1,
      roomCallback: () => {
        const costs = baseCosts.clone();
        costs.set(candidateX, candidateY, 255);
        return costs;
      }
    } as unknown as PathFinderOpts
  );
  return !result.incomplete;
};

/**
 * Computes (once) the full set of extension positions for the room's current
 * RCL and stores them in Memory.extensionPlan[room.name].  Uses PathFinder to
 * ensure no placed tile disconnects the spawn from sources or the controller.
 *
 * This is intentionally expensive — it should only be called when the RCL
 * changes (or on first boot when no plan exists yet).
 */
export const computeExtensionPlan = (room: Room): void => {
  const controller = room.controller;
  if (controller == null) return;

  const quota: number = (CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION] as Record<number, number>)[controller.level] ?? 0;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (spawn == null) return;

  const anchors: RoomPosition[] = room.find(FIND_SOURCES).map((s: Source) => s.pos);
  if (controller != null) anchors.push(controller.pos);

  const terrain = room.getTerrain();
  const { x: sx, y: sy } = spawn.pos;

  // Block existing structures and permanent obstacles in baseCosts so the
  // planner treats them as already occupied.
  const baseCosts: CostMatrix = new PathFinder.CostMatrix();
  for (const structure of room.find(FIND_MY_STRUCTURES)) {
    baseCosts.set(structure.pos.x, structure.pos.y, 255);
  }

  const planned: Array<{ x: number; y: number }> = [];
  let remaining = quota;

  for (let radius = 1; radius <= 20 && remaining > 0; radius++) {
    for (let dx = -radius; dx <= radius && remaining > 0; dx++) {
      for (let dy = -radius; dy <= radius && remaining > 0; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // perimeter only
        const x = sx + dx;
        const y = sy + dy;
        if (!isValidExtensionTile(terrain, x, y)) continue;
        // Skip if any anchor would become unreachable from spawn
        const blocks = anchors.some(anchor => !tileKeepsSpawnConnected(spawn.pos, anchor, x, y, baseCosts));
        if (blocks) continue;
        planned.push({ x, y });
        baseCosts.set(x, y, 255);
        remaining--;
      }
    }
  }

  if (Memory.extensionPlan == null) Memory.extensionPlan = {};
  Memory.extensionPlan[room.name] = { rcl: controller.level, sites: planned };
};

/**
 * Places construction sites for extensions that are in the plan but not yet
 * built or under construction.  No PathFinder calls — pure Memory read + API
 * calls only.
 */
const placeExtensionSites = (room: Room): void => {
  const plan = Memory.extensionPlan?.[room.name];
  if (plan == null) return;

  const builtCount = room.find(FIND_MY_STRUCTURES, { filter: (s: AnyStructure) => s.structureType === STRUCTURE_EXTENSION }).length;
  const siteCount = room.find(FIND_CONSTRUCTION_SITES, { filter: (s: ConstructionSite) => s.structureType === STRUCTURE_EXTENSION }).length;
  const alreadyAccountedFor = builtCount + siteCount;

  for (let i = alreadyAccountedFor; i < plan.sites.length; i++) {
    const { x, y } = plan.sites[i];
    // Skip tiles now occupied by something else (e.g. manually placed structures)
    if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
    if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
    room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
    break; // place one per tick to avoid flooding the construction site limit
  }
};

const hasAdjacentContainerCoverage = (source: Source): boolean => {
  const adjacentStructures = source.pos.findInRange(FIND_STRUCTURES, 1);
  if (adjacentStructures.some(structure => structure.structureType === STRUCTURE_CONTAINER)) {
    return true;
  }

  const adjacentSites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1);
  return adjacentSites.some(site => site.structureType === STRUCTURE_CONTAINER);
};

export const hasAdjacentControllerContainer = (room: Room): boolean => {
  const pos = room.controller?.pos;
  if (pos == null) return false;
  const structures: AnyStructure[] = pos.findInRange(FIND_STRUCTURES, 1);
  if (structures.some((s: AnyStructure) => s.structureType === STRUCTURE_CONTAINER)) return true;
  const sites = pos.findInRange(FIND_CONSTRUCTION_SITES, 1);
  return sites.some(site => site.structureType === STRUCTURE_CONTAINER);
};

const isBlockingStructure = (structure: { structureType: string }): boolean =>
  !["container", "road", "rampart"].includes(structure.structureType);

const findOpenAdjacentTile = (room: Room, source: { pos: { x: number; y: number } }): { x: number; y: number } | null => {
  const terrain = room.getTerrain();

  for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      if (x === source.pos.x && y === source.pos.y) continue;
      if (x < 0 || x > 49 || y < 0 || y > 49) continue;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

      const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
      if (structures.some(isBlockingStructure)) continue;

      const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
      if (constructionSites.length > 0) continue;

      return { x, y };
    }
  }

  return null;
};

export const placeControllerContainerSite = (room: Room): void => {
  if (room.controller?.pos == null) return;
  const openTile = findOpenAdjacentTile(room, room.controller);
  if (openTile != null) {
    room.createConstructionSite(openTile.x, openTile.y, STRUCTURE_CONTAINER);
  }
};

/**
 * Build task — places missing source containers and builds room construction sites.
 * Returns true only when the room has no construction sites, every source is
 * covered by an adjacent container or container construction site, AND the
 * controller has an adjacent container.
 */
export const runBuildTask = (creep: Creep): boolean => {
  const sources = creep.room.find(FIND_SOURCES);
  const uncoveredSources = sources.filter(source => !hasAdjacentContainerCoverage(source));

  for (const source of uncoveredSources) {
    const openTile = findOpenAdjacentTile(creep.room, source);
    if (openTile != null) {
      creep.room.createConstructionSite(openTile.x, openTile.y, STRUCTURE_CONTAINER);
    }
  }

  // Place controller container site if not already present
  if (!hasAdjacentControllerContainer(creep.room)) {
    placeControllerContainerSite(creep.room);
  }

  const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);

  if (constructionSites.length === 0 && uncoveredSources.length === 0 && hasAdjacentControllerContainer(creep.room)) {
    return true;
  }

  const harvestRate = computeRoomHarvestRate(creep.room.name);
  const fleetCost = computeFleetMaintenanceCost(creep.room.name);
  const upgraders = countUpgradersInRoom(creep.room.name);
  if (canBuildExpansions(harvestRate, fleetCost, WORKER_BODY_COST, upgraders)) {
    placeExtensionSites(creep.room);
  }

  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    const storage = creep.room.storage;
    if (storage != null && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      const withdrawResult = creep.withdraw(storage, RESOURCE_ENERGY);
      if (withdrawResult === ERR_NOT_IN_RANGE) {
        creep.moveTo(storage);
      }

      return false;
    }

    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source != null) {
      const harvestResult = creep.harvest(source);
      if (harvestResult === ERR_NOT_IN_RANGE) {
        creep.moveTo(source);
      }
    }

    return false;
  }

  const constructionSite = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
  if (constructionSite != null) {
    const buildResult = creep.build(constructionSite);
    if (buildResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(constructionSite);
    }
  }

  return false;
};
