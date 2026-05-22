/**
 * Harvest task — moves to the creep's assigned source (or closest if unpinned) and mines it.
 *
 * When the creep's store is full:
 * - If the source has an adjacent container (pseudo-static mode), deposit into it (or drop if full).
 *   Returns false — the creep stays in the harvest task.
 * - Otherwise, clears obtainedFromId and returns true (task complete, re-evaluate).
 */
export const runHarvestTask = (creep: Creep, ctx: TickContext): boolean => {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    const storedSourceId = creep.memory?.sourceId;
    const info = storedSourceId != null ? ctx.sourceContainerMap[storedSourceId] : undefined;
    if (info != null) {
      const container = Game.getObjectById<StructureContainer>(info.containerId);
      if (container != null) {
        const transferResult = creep.transfer(container, RESOURCE_ENERGY);
        if (transferResult === ERR_NOT_IN_RANGE) {
          creep.moveTo(container, { reusePath: 20 });
        } else if (transferResult !== OK) {
          // ERR_FULL or any other error — drop on the ground to avoid blocking
          creep.drop(RESOURCE_ENERGY);
        }
        return false; // stay in harvest task
      }
    }
    // No container info or container gone — original behaviour
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

  const harvestResult = creep.harvest(source);
  if (harvestResult === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, { reusePath: 20 });
  }

  return false;
};
