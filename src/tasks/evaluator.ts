const CRITICAL_THRESHOLD = 0.3;

export const evaluateTask = (creep: Creep): TaskType => {
  const role = creep.memory?.role;
  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
  const spawnEnergy = spawn != null ? spawn.store[RESOURCE_ENERGY] : 0;
  const spawnCapacity = spawn != null ? spawn.store.getCapacity(RESOURCE_ENERGY) ?? 300 : 300;
  const spawnIsCritical = spawnEnergy / spawnCapacity < CRITICAL_THRESHOLD;
  const spawnHasRoom = spawn != null && (spawn.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0;

  const storage = creep.room.storage;
  const storageHasRoom = storage != null && (storage.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0;

  const extensionHasRoom = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s: AnyOwnedStructure) =>
      s.structureType === STRUCTURE_EXTENSION &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  }).length > 0;

  const canDeposit = spawnHasRoom || storageHasRoom || extensionHasRoom;
  const creepHasEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;

  if (role === "stationaryHarvester") return "harvestAndDeposit";
  if (role === "miner") return "harvestAndDeposit";

  if (role === "hauler") {
    if (creepHasEnergy && canDeposit) return "deposit";
    return "forage";
  }

  if (role === "builder") {
    const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
    const sourcesInRoom = creep.room.find(FIND_SOURCES);
    const sourceNeedsContainer = sourcesInRoom.some(source => {
      const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure: Structure): boolean => structure.structureType === STRUCTURE_CONTAINER
      });
      const containerSites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
        filter: (site: ConstructionSite): boolean => site.structureType === STRUCTURE_CONTAINER
      });

      return containers.length === 0 && containerSites.length === 0;
    });

    if (constructionSites.length > 0 || sourceNeedsContainer) return "build";
  }

  const sources = creep.room.find(FIND_SOURCES_ACTIVE);
  const sourceAvailable = sources.length > 0;

  const creepIsFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;

  // Priority 1 — prevent spawn death (emergency: deposit any energy immediately)
  if (spawnIsCritical) {
    if (creepHasEnergy && spawnHasRoom) return "deposit";
    if (!creepHasEnergy && sourceAvailable) return "harvest";
  }

  // Harvester pinned to a source that has an adjacent container: dump energy
  // into the container and let haulers carry it to spawn/storage.  The
  // spawn-critical check above already handled the case where the spawn needs
  // a top-up right now.
  // Guard: only go stationary when there is at least one hauler per container
  // source — otherwise harvesters stay mobile and deliver directly to spawn
  // until the hauler supply is established.
  if (role === "harvester" && creep.memory.sourceId != null) {
    const pinnedSource = Game.getObjectById<Source>(creep.memory.sourceId);
    if (pinnedSource != null) {
      const hasAdjacentContainer = pinnedSource.pos
        .findInRange(FIND_STRUCTURES, 1)
        .some((s: Structure) => s.structureType === STRUCTURE_CONTAINER);
      if (hasAdjacentContainer) {
        const roomName = creep.memory.room;
        const haulerCount = Object.values(Game.creeps).filter(
          (c: Creep) => c.memory.room === roomName && c.memory.role === "hauler"
        ).length;
        const containerSourceCount = creep.room.find(FIND_SOURCES).filter(source =>
          source.pos
            .findInRange(FIND_STRUCTURES, 1)
            .some((s: Structure) => s.structureType === STRUCTURE_CONTAINER)
        ).length;
        if (haulerCount >= containerSourceCount) return "harvestAndDeposit";
      }
    }
  }

  // Priority 2 — creep is full, deliver energy
  if (creepIsFull) {
    if (canDeposit) return "deposit";
    return "upgrade";
  }

  // Priority 3 — creep is not full, keep harvesting if a source is available
  if (sourceAvailable) return "harvest";

  // Priority 4 — no source available; deliver whatever energy we have
  if (creepHasEnergy) {
    if (canDeposit) return "deposit";
    return "upgrade";
  }

  // Fallback — empty with no source; upgrade will wait internally for energy
  return "upgrade";
};
