const CRITICAL_THRESHOLD = 0.3;

export const evaluateTask = (creep: Creep): TaskType => {
  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
  const spawnEnergy = spawn != null ? spawn.store[RESOURCE_ENERGY] : 0;
  const spawnCapacity = spawn != null ? (spawn.store.getCapacity(RESOURCE_ENERGY) ?? 300) : 300;
  const spawnIsCritical = spawnEnergy / spawnCapacity < CRITICAL_THRESHOLD;
  const spawnHasRoom = spawn != null && (spawn.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0;

  const storage = creep.room.storage;
  const storageHasRoom =
    storage != null && (storage.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0;

  const canDeposit = spawnHasRoom || storageHasRoom;

  const sources = creep.room.find(FIND_SOURCES_ACTIVE);
  const sourceAvailable = sources.length > 0;

  const creepHasEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;

  // Priority 1 — prevent spawn death
  if (spawnIsCritical) {
    if (creepHasEnergy && spawnHasRoom) return "deposit";
    if (!creepHasEnergy && sourceAvailable) return "harvest";
  }

  // Priority 2 — creep has energy, find best outlet
  if (creepHasEnergy) {
    if (canDeposit) return "deposit";
    return "upgrade";
  }

  // Priority 3 — creep is empty, find energy
  if (sourceAvailable) return "harvest";

  // Fallback — no source available; upgrade will wait internally for energy
  return "upgrade";
};
