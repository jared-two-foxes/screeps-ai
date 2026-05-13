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
  const hasAvailableStorage = storage != null && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);

  let target: StructureSpawn | StructureStorage | null = null;
  if (hasAvailableStorage && spawn != null) {
    const storageRange = creep.pos.getRangeTo(storage);
    const spawnRange = creep.pos.getRangeTo(spawn);
    target = storageRange <= spawnRange ? storage : spawn;
  } else if (spawn != null) {
    target = spawn;
  } else if (hasAvailableStorage) {
    target = storage;
  }

  if (target == null) {
    return;
  }

  const transferResult = creep.transfer(target, RESOURCE_ENERGY);
  if (transferResult === ERR_NOT_IN_RANGE) {
    creep.moveTo(target);
  }
};
