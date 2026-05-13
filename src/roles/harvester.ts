export const runHarvester = (creep: Creep): void => {
  const isEmpty = creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
  const isFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;

  if (isEmpty) {
    creep.memory.working = false;
  } else if (isFull) {
    creep.memory.working = true;
  }

  if (!creep.memory.working) {
    const source = creep.pos.findClosestByRange(FIND_SOURCES);
    if (source == null) {
      return;
    }

    const harvestResult = creep.harvest(source);
    if (harvestResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(source);
    }
    return;
  }

  const storage = creep.room.storage;
  if (storage != null && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const transferResult = creep.transfer(storage, RESOURCE_ENERGY);
    if (transferResult === ERR_NOT_IN_RANGE) {
      creep.moveTo(storage);
    }
    return;
  }

  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
  if (spawn == null) {
    return;
  }

  const spawnTransferResult = creep.transfer(spawn, RESOURCE_ENERGY);
  if (spawnTransferResult === ERR_NOT_IN_RANGE) {
    creep.moveTo(spawn);
  }
};
