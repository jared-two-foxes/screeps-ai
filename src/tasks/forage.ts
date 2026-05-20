/**
 * Forage task — hauler behavior for collecting energy from containers or dropped resources.
 *
 * Target is cached in creep.memory.forageTargetId and revalidated each tick
 * (existence + non-empty check). Only falls back to findClosestByRange when
 * the cached target is missing or drained — avoiding a room scan every tick.
 *
 * Returns true (task complete) when the creep is full or nothing can be foraged.
 * Sets obtainedFromId to the container id when withdrawing from a container so that
 * the subsequent deposit task can avoid returning energy to the same container.
 * Clears obtainedFromId and forageTargetId when picking up dropped resources or
 * when nothing is found.
 */

const isContainerStructure = (s: AnyStructure): s is StructureContainer =>
  s.structureType === STRUCTURE_CONTAINER;

const withdrawFrom = (creep: Creep, container: StructureContainer): false => {
  if (creep.memory != null) creep.memory.obtainedFromId = container.id;
  const result = creep.withdraw(container, RESOURCE_ENERGY);
  if (result === ERR_NOT_IN_RANGE) {
    creep.moveTo(container, { reusePath: 20 });
  }
  return false;
};

export const runForageTask = (creep: Creep): boolean => {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    if (creep.memory != null) creep.memory.forageTargetId = undefined;
    return true;
  }

  // --- Resolve cached container target ---
  if (creep.memory?.forageTargetId != null) {
    const cached = Game.getObjectById(creep.memory.forageTargetId);
    if (cached != null && "structureType" in cached && isContainerStructure(cached)) {
      // Container is still live — check it has energy.
      if (cached.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return withdrawFrom(creep, cached);
      }
      // Drained — fall through to re-scan.
      creep.memory.forageTargetId = undefined;
    } else if (cached != null && "amount" in cached) {
      // Cached a dropped resource — handled further below; clear here so we re-scan containers first.
      creep.memory.forageTargetId = undefined;
    } else if (cached == null) {
      creep.memory.forageTargetId = undefined;
    }
  }

  // --- Container scan ---
  const found = creep.pos.findClosestByRange(FIND_STRUCTURES, {
    filter: (s: AnyStructure): boolean =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
  });
  const container = found != null && isContainerStructure(found) &&
    found.store.getUsedCapacity(RESOURCE_ENERGY) > 0 ? found : null;

  if (container != null) {
    if (creep.memory != null) {
      creep.memory.forageTargetId = container.id as Id<StructureContainer | Resource>;
    }
    return withdrawFrom(creep, container);
  }

  // --- Dropped resource path ---
  if (creep.memory != null) creep.memory.obtainedFromId = undefined;

  const droppedResource = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
    filter: (r: Resource): boolean => r.resourceType === RESOURCE_ENERGY && r.amount > 0
  });

  if (droppedResource == null) {
    if (creep.memory != null) creep.memory.forageTargetId = undefined;
    return true;
  }

  if (creep.memory != null) {
    creep.memory.forageTargetId = droppedResource.id as Id<StructureContainer | Resource>;
  }
  const pickupResult = creep.pickup(droppedResource);
  if (pickupResult === ERR_NOT_IN_RANGE) {
    creep.moveTo(droppedResource, { reusePath: 20 });
  }

  return false;
};
