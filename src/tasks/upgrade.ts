/**
 * Upgrade task — upgrades the room controller.
 * Self-contained: gathers energy until full (storage withdraw → source harvest),
 * then upgrades until empty.
 *
 * Two-phase hysteresis via `creep.memory.upgradeGathering`:
 *   - Transitions to gather phase only when the store is completely empty.
 *   - Transitions to upgrade phase only when the store is completely full.
 *   - Between the two extremes the phase is sticky, preventing the creep from
 *     flip-flopping back to gather after spending just one energy unit.
 *
 * If no energy source is reachable but the creep carries some energy, it
 * upgrades with whatever it has rather than idling.
 *
 * Returns true (task complete) only when the store is empty and no energy
 * source is available — signals the evaluator to re-assign a task.
 */
export const runUpgradeTask = (creep: Creep): boolean => {
  const isEmpty = creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
  const isFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;

  // Phase transitions — only fire at the store boundaries.
  if (isFull) creep.memory.upgradeGathering = false;
  if (isEmpty) creep.memory.upgradeGathering = true;

  // Current phase: use flag if set; default to gather when empty, upgrade when carrying.
  const gathering = creep.memory.upgradeGathering ?? isEmpty;

  if (gathering) {
    // Try storage first
    const storage = creep.room.storage;
    if (storage != null && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      const withdrawResult = creep.withdraw(storage, RESOURCE_ENERGY);
      if (withdrawResult === ERR_NOT_IN_RANGE) creep.moveTo(storage);
      return false;
    }

    // Pinned source (controller-supply role)
    const pinnedId = creep.memory.sourceId;
    if (pinnedId != null) {
      const pinned = Game.getObjectById<Source>(pinnedId);
      if (pinned != null) {
        const pinnedHarvestResult = creep.harvest(pinned);
        if (pinnedHarvestResult === ERR_NOT_IN_RANGE) creep.moveTo(pinned);
        return false;
      }
    }

    // Fall back to closest active source (1-source rooms / no pin)
    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source != null) {
      const harvestResult = creep.harvest(source);
      if (harvestResult === ERR_NOT_IN_RANGE) creep.moveTo(source);
      return false;
    }

    // No energy source available — signal re-evaluation if empty, otherwise
    // fall through to upgrade with whatever energy is carried.
    if (isEmpty) return true;
  }

  // Upgrade phase (or partial-energy fallback when sources are unavailable)
  const controller = creep.room.controller;
  if (controller == null) return true;

  const upgradeResult = creep.upgradeController(controller);
  if (upgradeResult === ERR_NOT_IN_RANGE) creep.moveTo(controller);

  return false;
};
