import { canBuildExpansions } from "spawner";

const WORKER_BODY_COST = 200; // WORK(100) + CARRY(50) + MOVE(50)

const computeRoomHarvestRate = (roomName: string): number => {
  const harvestRoles = new Set(["harvester", "miner", "stationaryHarvester"]);
  let total = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room !== roomName) continue;
    if (!harvestRoles.has(creep.memory.role)) continue;
    total += creep.body.filter((p: { type: BodyPartConstant }) => p.type === WORK).length * 2;
  }
  return total;
};

const computeFleetMaintenanceCost = (roomName: string): number => {
  let totalCost = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room !== roomName) continue;
    for (const part of creep.body as { type: BodyPartConstant }[]) {
      totalCost += BODYPART_COST[part.type] ?? 0;
    }
  }
  return totalCost / CREEP_LIFE_TIME;
};

const countUpgradersInRoom = (roomName: string): number => {
  let count = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room === roomName && creep.memory.role === "upgrader") count++;
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

const placeExtensionSites = (room: Room): void => {
  let needed = extensionsNeeded(room);
  if (needed === 0) return;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (spawn == null) return;

  const terrain = room.getTerrain();
  const { x: sx, y: sy } = spawn.pos;

  for (let radius = 1; radius <= 10 && needed > 0; radius++) {
    for (let dx = -radius; dx <= radius && needed > 0; dx++) {
      for (let dy = -radius; dy <= radius && needed > 0; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // perimeter only
        const x = sx + dx;
        const y = sy + dy;
        if (!isValidExtensionTile(room, terrain, x, y)) continue;
        room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
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

const isBlockingStructure = (structure: { structureType: string }): boolean =>
  !["container", "road", "rampart"].includes(structure.structureType);

const findOpenAdjacentTile = (room: Room, source: Source): { x: number; y: number } | null => {
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

/**
 * Build task — places missing source containers and builds room construction sites.
 * Returns true only when the room has no construction sites and every source is
 * covered by an adjacent container or container construction site.
 */
export const runBuildTask = (creep: Creep): boolean => {
  const sources = creep.room.find(FIND_SOURCES);
  const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
  const uncoveredSources = sources.filter(source => !hasAdjacentContainerCoverage(source));

  if (constructionSites.length === 0 && uncoveredSources.length === 0) {
    return true;
  }

  for (const source of uncoveredSources) {
    const openTile = findOpenAdjacentTile(creep.room, source);
    if (openTile != null) {
      creep.room.createConstructionSite(openTile.x, openTile.y, STRUCTURE_CONTAINER);
    }
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

    const source = creep.pos.findClosestByRange(FIND_SOURCES);
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
