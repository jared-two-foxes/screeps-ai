/**
 * Deposit task — transfers energy to the nearest eligible structure.
 * Target preference:
 *   1. Extensions (they gate high-tier spawns; only those with free capacity)
 *   2. Spawn (must have free capacity) or storage, chosen by proximity
 *
 * Reads creep.memory.obtainedFromId to exclude the container the creep just
 * withdrew from, preventing energy being returned to its source.
 *
 * Returns true (task complete) when:
 *   - The creep's store is empty, OR
 *   - No valid deposit target exists, OR
 *   - The chosen target returned ERR_FULL mid-delivery.
 * Clears obtainedFromId on completion.
 */

const complete = (creep: Creep): true => {
  if (creep.memory != null) creep.memory.obtainedFromId = undefined;
  return true;
};

export const runDepositTask = (creep: Creep): boolean => {
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return complete(creep);

  // Priority 1: fill extensions (they gate all high-tier spawns)
  const extension = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
    filter: (s: AnyOwnedStructure) =>
      s.structureType === STRUCTURE_EXTENSION &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });

  if (extension != null) {
    if (creep.transfer(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(extension, { reusePath: 5 });
    }
    return false;
  }

  // Priority 2: spawn (must have room) or storage, chosen by proximity
  const excludeId = creep.memory?.obtainedFromId;
  const storage = creep.room.storage;
  const hasAvailableStorage =
    storage != null &&
    (storage.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0 &&
    (storage as unknown as { id: string }).id !== excludeId;
  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {
    filter: (s: StructureSpawn) => (s.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0
  });

  let target: StructureSpawn | StructureStorage | null = null;

  if (hasAvailableStorage && spawn != null && storage != null) {
    const storageRange = creep.pos.getRangeTo(storage);
    const spawnRange = creep.pos.getRangeTo(spawn);
    target = storageRange <= spawnRange ? storage : spawn;
  } else if (spawn != null) {
    target = spawn;
  } else if (hasAvailableStorage && storage != null) {
    target = storage;
  }

  if (target != null) {
    const result = creep.transfer(target, RESOURCE_ENERGY);
    if (result === ERR_FULL) return complete(creep);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(target, { reusePath: 1 });
    return false;
  }

  return complete(creep);
};
