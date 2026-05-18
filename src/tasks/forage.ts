/**
 * Forage task — hauler behavior for collecting energy from containers or dropped resources.
 * Returns true (task complete) when the creep is full or nothing can be foraged.
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
      ? found
      : null;

  if (container != null) {
    const withdrawResult = creep.withdraw(container, RESOURCE_ENERGY);
    if (withdrawResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(container);
    }

    return false;
  }

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
