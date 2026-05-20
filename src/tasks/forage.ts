/**
 * Forage task — hauler behavior for collecting energy from containers or dropped resources.
 * Returns true (task complete) when the creep is full or nothing can be foraged.
 * Sets obtainedFromId to the container id when withdrawing from a container so that
 * the subsequent deposit task can avoid returning energy to the same container.
 * Clears obtainedFromId when picking up dropped resources or when nothing is found.
 */
export const runForageTask = (creep: Creep): boolean => {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;

  const found = creep.pos.findClosestByRange(FIND_STRUCTURES, {
    filter: (s: AnyStructure): boolean =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
  });
  const container =
    found != null &&
    found.structureType === STRUCTURE_CONTAINER &&
    found.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      ? (found as StructureContainer)
      : null;

  if (container != null) {
    if (creep.memory != null) creep.memory.obtainedFromId = container.id;
    const withdrawResult = creep.withdraw(container, RESOURCE_ENERGY);
    if (withdrawResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(container);
    }

    return false;
  }

  // Dropped resources — no container id to record
  if (creep.memory != null) creep.memory.obtainedFromId = undefined;

  const droppedResource = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
    filter: (r: Resource): boolean => r.resourceType === RESOURCE_ENERGY && r.amount > 0
  });

  if (droppedResource == null) return true;

  const pickupResult = creep.pickup(droppedResource);
  if (pickupResult === ERR_NOT_IN_RANGE) {
    creep.moveTo(droppedResource);
  }

  return false;
};
