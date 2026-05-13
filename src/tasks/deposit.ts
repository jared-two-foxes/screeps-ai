/**
 * Deposit task — transfers energy to the nearest eligible structure.
 * Target preference: spawn vs storage by proximity; storage must not be full.
 *
 * Returns true (task complete) when:
 *   - The creep's store is empty, OR
 *   - No valid deposit target exists (triggers re-evaluation → "upgrade"), OR
 *   - The chosen target returned ERR_FULL mid-delivery.
 */
export const runDepositTask = (creep: Creep): boolean => {
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;

  const storage = creep.room.storage;
  const hasAvailableStorage =
    storage != null && (storage.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0;
  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);

  let target: StructureSpawn | StructureStorage | null = null;

  if (hasAvailableStorage && spawn != null) {
    const storageRange = creep.pos.getRangeTo(storage);
    const spawnRange = creep.pos.getRangeTo(spawn);
    target = storageRange <= spawnRange ? storage : spawn;
  } else if (spawn != null) {
    target = spawn;
  } else if (hasAvailableStorage) {
    target = storage;
  }

  if (target == null) return true;

  const result = creep.transfer(target, RESOURCE_ENERGY);

  if (result === ERR_FULL) return true;
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);

  return false;
};
