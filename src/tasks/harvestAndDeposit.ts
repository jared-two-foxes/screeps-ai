/**
 * Harvest-and-deposit task — stationary harvester behavior.
 * Never completes on its own; the creep keeps harvesting and offloading forever.
 */
export const runHarvestAndDepositTask = (creep: Creep): boolean => {
  const source = creep.pos.findClosestByRange(FIND_SOURCES);
  if (source == null) return false;

  if (creep.store.getFreeCapacity() > 0) {
    if (creep.pos.getRangeTo(source) > 1) {
      creep.moveTo(source);
    }

    const harvestResult = creep.harvest(source);
    if (harvestResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(source);
    }

    return false;
  }

  const container = creep.pos
    .findInRange(FIND_STRUCTURES, 1)
    .find((structure): structure is StructureContainer => structure.structureType === STRUCTURE_CONTAINER);

  if (container != null) {
    const transferResult = creep.transfer(container, RESOURCE_ENERGY);

    if (transferResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(container);
      return false;
    }

    if (transferResult >= 0) return false;
  }

  creep.drop(RESOURCE_ENERGY);
  return false;
};
