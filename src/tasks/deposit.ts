/**
 * Deposit task — transfers energy to the nearest eligible structure.
 * Target preference:
 *   1. Extensions (they gate high-tier spawns; only those with free capacity)
 *   2. Spawn (must have free capacity) or storage, chosen by proximity
 *
 * Reads creep.memory.obtainedFromId to exclude the container the creep just
 * withdrew from, preventing energy being returned to its source.
 *
 * Target is cached in creep.memory.depositTargetId and revalidated each tick
 * (existence + free capacity check). Only falls back to findClosestByRange
 * when the cached target is missing or full — avoiding a room scan every tick.
 *
 * Returns true (task complete) when:
 *   - The creep's store is empty, OR
 *   - No valid deposit target exists, OR
 *   - The chosen target returned ERR_FULL mid-delivery.
 * Clears depositTargetId and obtainedFromId on completion.
 */

type DepositTarget = StructureExtension | StructureSpawn | StructureStorage;

const complete = (creep: Creep): true => {
  if (creep.memory != null) {
    creep.memory.obtainedFromId = undefined;
    creep.memory.depositTargetId = undefined;
  }
  return true;
};

/** Resolve and validate a cached deposit target. Returns null if gone or full. */
const resolveDepositTarget = (id: Id<DepositTarget>): DepositTarget | null => {
  const target = Game.getObjectById(id);
  if (target == null) return null;
  if ((target.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) <= 0) return null;
  return target;
};

/** Find the best deposit target via room scan (extensions first, then spawn/storage by range). */
const findDepositTarget = (creep: Creep): DepositTarget | null => {
  const extension = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
    filter: (s: AnyOwnedStructure) =>
      s.structureType === STRUCTURE_EXTENSION &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  }) as DepositTarget | null;

  if (extension != null) return extension;

  const excludeId = creep.memory?.obtainedFromId;
  const storage = creep.room.storage;
  const hasAvailableStorage =
    storage != null &&
    (storage.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0 &&
    (storage as unknown as { id: string }).id !== excludeId;
  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {
    filter: (s: StructureSpawn) => (s.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0
  });

  if (hasAvailableStorage && spawn != null && storage != null) {
    return creep.pos.getRangeTo(storage) <= creep.pos.getRangeTo(spawn) ? storage : spawn;
  }
  if (spawn != null) return spawn;
  if (hasAvailableStorage && storage != null) return storage;
  return null;
};

export const runDepositTask = (creep: Creep): boolean => {
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return complete(creep);

  // Resolve cached target; re-scan only if missing or full.
  let target: DepositTarget | null = null;
  if (creep.memory?.depositTargetId != null) {
    target = resolveDepositTarget(creep.memory.depositTargetId);
  }
  if (target == null) {
    target = findDepositTarget(creep);
    if (creep.memory != null) {
      creep.memory.depositTargetId = target != null
        ? (target as unknown as { id: Id<DepositTarget> }).id
        : undefined;
    }
  }

  if (target == null) return complete(creep);

  const result = creep.transfer(target, RESOURCE_ENERGY);
  if (result === ERR_FULL) return complete(creep);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(target, { reusePath: 20 });

  return false;
};
