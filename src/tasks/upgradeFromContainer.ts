/**
 * upgradeFromContainer task — upgrades the controller using energy withdrawn
 * from an adjacent container. Never returns true (task is permanent for
 * stationaryUpgrader body creeps).
 */
export const runUpgradeFromContainerTask = (creep: Creep): boolean => {
  const controller = creep.room.controller;

  // If we have energy, upgrade the controller
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    const result = creep.upgradeController(controller!);
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(controller!);
    }
    return false;
  }

  // Store is empty — withdraw from adjacent container
  let containers = creep.pos
    .findInRange(FIND_STRUCTURES, 1)
    .filter(
      (s: AnyStructure) =>
        s.structureType === STRUCTURE_CONTAINER &&
        (s ).store.getUsedCapacity(RESOURCE_ENERGY) > 0
    );

  if (containers.length === 0) {
    containers = creep.pos
      .findInRange(FIND_STRUCTURES, 3)
      .filter(
        (s: AnyStructure) =>
          s.structureType === STRUCTURE_CONTAINER &&
          (s ).store.getUsedCapacity(RESOURCE_ENERGY) > 0
      );
  }

  if (containers.length > 0) {
    const result = creep.withdraw(containers[0] as StructureContainer, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(containers[0]);
    }
  } else {
    creep.moveTo(controller!);
  }

  return false;
};
