export const runUpgrader = (creep: Creep): void => {
  const isEmpty = creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
  const isFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;

  if (isEmpty) {
    creep.memory.working = false;
  } else if (isFull) {
    creep.memory.working = true;
  }

  if (creep.memory.working === true) {
    const controller = creep.room.controller;
    if (controller == null) {
      return;
    }

    const upgradeResult = creep.upgradeController(controller);
    if (upgradeResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(controller);
    }
    return;
  }

  const storage = creep.room.storage;
  const hasAvailableStorage = storage != null && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  if (hasAvailableStorage) {
    const withdrawResult = creep.withdraw(storage, RESOURCE_ENERGY);
    if (withdrawResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(storage);
    }
    return;
  }

  const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
  if (source == null) {
    return;
  }

  const harvestResult = creep.harvest(source);
  if (harvestResult === ERR_NOT_IN_RANGE) {
    creep.moveTo(source);
  }
};
