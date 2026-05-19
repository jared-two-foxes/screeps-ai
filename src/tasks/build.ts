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

const extensionsNeeded = (room: Room): number => {
  const controller = room.controller;
  if (controller == null) return 0;

  const quota: number = (CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION] as Record<number, number>)[controller.level] ?? 0;
  const built = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
  const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;

  return Math.max(0, quota - built - sites);
};

const isValidExtensionTile = (room: Room, terrain: RoomTerrain, x: number, y: number): boolean => {
  if (x < 1 || x > 48 || y < 1 || y > 48) return false;
  if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
  if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) return false;
  if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) return false;
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

const placeExtensionSites = (room: Room): void => {
  let needed = extensionsNeeded(room);
  if (needed === 0) return;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (spawn == null) return;

  // Need at least one connectivity anchor — use sources and controller.
  const anchors: RoomPosition[] = room.find(FIND_SOURCES).map(s => s.pos);
  if (room.controller != null) anchors.push(room.controller.pos);
  if (anchors.length === 0) return;

  const terrain = room.getTerrain();
  const { x: sx, y: sy } = spawn.pos;

  // Seed baseCosts with all existing construction sites so that each
  // candidate tile is checked against the cumulative blocked state, not
  // just itself in isolation.
  const baseCosts: CostMatrix = new PathFinder.CostMatrix();
  for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
    baseCosts.set(site.pos.x, site.pos.y, 255);
  }

  for (let radius = 1; radius <= 10 && needed > 0; radius++) {
    for (let dx = -radius; dx <= radius && needed > 0; dx++) {
      for (let dy = -radius; dy <= radius && needed > 0; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // perimeter only
        const x = sx + dx;
        const y = sy + dy;
        if (!isValidExtensionTile(room, terrain, x, y)) continue;
        // Skip this tile if placing an extension here would cut off the spawn
        // from any of its anchors (sources / controller).
        const blocks = anchors.some(anchor => !tileKeepsSpawnConnected(spawn.pos, anchor, x, y, baseCosts));
        if (blocks) continue;
        room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
        // Update baseCosts immediately so the next candidate sees this site
        // as already blocked.
        baseCosts.set(x, y, 255);
        needed--;
      }
    }
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
