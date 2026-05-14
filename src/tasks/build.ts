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
