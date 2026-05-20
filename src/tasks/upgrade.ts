/**
 * Upgrade task — upgrades the room controller.
 * Single-phase: assumes the creep arrives with energy.
 * Returns true (task complete) when the store is empty, signalling the evaluator
 * to re-assign (typically to harvest/forage to refill).
 * Clears obtainedFromId on completion.
 */
export const runUpgradeTask = (creep: Creep): boolean => {
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    creep.memory.obtainedFromId = undefined;
    return true;
  }

  const controller = creep.room.controller;
  if (controller == null) {
    creep.memory.obtainedFromId = undefined;
    return true;
  }

  const upgradeResult = creep.upgradeController(controller);
  if (upgradeResult === ERR_NOT_IN_RANGE) creep.moveTo(controller, { reusePath: 20 });

  return false;
};
