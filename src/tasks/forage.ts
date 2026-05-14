/**
 * Forage task — hauler behavior for collecting energy from containers or dropped resources.
 * Returns true (task complete) when the creep is full or nothing can be foraged.
 */
export const runForageTask = (creep: Creep): boolean => {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;

  const structure = creep.pos.findClosestByRange(FIND_STRUCTURES);
  const container =
    structure != null &&
    structure.structureType === STRUCTURE_CONTAINER &&
    structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      ? structure
      : null;

  if (container != null) {
    const withdrawResult = creep.withdraw(container, RESOURCE_ENERGY);
    if (withdrawResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(container);
    }

    return false;
  }

  const resource = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES);
  const droppedResource =
    resource != null && resource.resourceType === RESOURCE_ENERGY && resource.amount > 0 ? resource : null;

  if (droppedResource == null) return true;

  const pickupResult = creep.pickup(droppedResource);
  if (pickupResult === ERR_NOT_IN_RANGE) {
    creep.moveTo(droppedResource);
  }

  return false;
};
