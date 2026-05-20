/**
 * Harvest task — moves to the creep's assigned source (or closest if unpinned) and mines it.
 * Returns true (task complete) when the creep's store is full or no source can be found.
 * Clears obtainedFromId on completion — energy came from a Source, not a container.
 */
export const runHarvestTask = (creep: Creep): boolean => {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    if (creep.memory != null) creep.memory.obtainedFromId = undefined;
    return true;
  }

  const pinnedId = creep.memory?.sourceId;
  const pinned = pinnedId != null ? Game.getObjectById<Source>(pinnedId) : null;
  const source = pinned ?? creep.pos.findClosestByRange(FIND_SOURCES);
  if (source == null) {
    if (creep.memory != null) creep.memory.obtainedFromId = undefined;
    return true;
  }

  const result = creep.harvest(source);
  if (result === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, { reusePath: 1 });
  }

  return false;
};
