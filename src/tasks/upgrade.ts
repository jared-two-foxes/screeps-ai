/**
 * Upgrade task — upgrades the room controller.
 * Self-contained: gathers energy when empty (storage withdraw → source harvest),
 * then upgrades. Returns true (task complete) when the store empties mid-upgrade
 * and there is no immediately available energy to refill from.
 *
 * Completion is detected at the top of the next tick when the store hits zero.
 */
export const runUpgradeTask = (creep: Creep): boolean => {
  const hasEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;

  if (!hasEnergy) {
    // Try storage first
    const storage = creep.room.storage;
    if (storage != null && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      const withdrawResult = creep.withdraw(storage, RESOURCE_ENERGY);
      if (withdrawResult === ERR_NOT_IN_RANGE) creep.moveTo(storage);
      return false;
    }

    // Fall back to closest active source
    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source == null) return true; // nothing to gather — task complete, re-evaluate

    const harvestResult = creep.harvest(source);
    if (harvestResult === ERR_NOT_IN_RANGE) creep.moveTo(source);
    return false;
  }

  // Creep has energy — upgrade the controller
  const controller = creep.room.controller;
  if (controller == null) return true;

  const upgradeResult = creep.upgradeController(controller);
  if (upgradeResult === ERR_NOT_IN_RANGE) creep.moveTo(controller);

  return false;
};
