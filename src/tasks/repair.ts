const REPAIR_THRESHOLD = 0.75;

/**
 * Repair task — keeps a creep repairing structures that have fallen below
 * REPAIR_THRESHOLD (75% hits).
 *
 * Target selection:
 *   1. Prefer structures not already claimed by another creep's repairTargetId.
 *   2. Among equally-claimed tiers, pick the most critically damaged
 *      (lowest hits/hitsMax ratio).
 *   3. Fall back to already-claimed structures only when every candidate
 *      already has at least one repairer assigned.
 *
 * The creep stays on its repairTargetId until:
 *   - Energy reaches 0 → clear target, return true (re-evaluate)
 *   - Target reaches hitsMax → clear target, immediately cycle to next target
 *     in the same tick (does not return true; continues repairing if possible)
 *   - Target disappears → clear target, cycle to next target same tick
 *   - No repair targets remain → return true (re-evaluate)
 *
 * ctx.repairAllocations is mutated when a new target is selected so that
 * same-tick assignments by other creeps see the updated allocation counts.
 */
export const runRepairTask = (creep: Creep, ctx: TickContext): boolean => {
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    creep.memory.repairTargetId = undefined;
    return true;
  }

  // Resolve and validate cached target. Loop allows same-tick cycling when a
  // target is fully repaired.
  for (let attempts = 0; attempts < 2; attempts++) {
    let target: AnyStructure | null = null;

    if (creep.memory.repairTargetId != null) {
      target = Game.getObjectById(creep.memory.repairTargetId);
      // Invalidate if gone or fully repaired past threshold
      if (target == null || target.hits >= target.hitsMax) {
        creep.memory.repairTargetId = undefined;
        target = null;
      }
    }

    if (target == null) {
      // Scan for a new target
      const candidates = creep.room.find(FIND_STRUCTURES, {
        filter: (s: AnyStructure) => s.hits < s.hitsMax * REPAIR_THRESHOLD
      });

      if (candidates.length === 0) {
        return true;
      }

      // Sort by criticality (lowest hits/hitsMax first)
      candidates.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));

      // Partition into unclaimed and claimed
      const unclaimed = candidates.filter(s => (ctx.repairAllocations[s.id] ?? 0) === 0);
      const claimed = candidates.filter(s => (ctx.repairAllocations[s.id] ?? 0) > 0);

      const picked = unclaimed[0] ?? claimed[0];
      if (picked == null) return true;

      creep.memory.repairTargetId = picked.id as Id<AnyStructure>;
      ctx.repairAllocations[picked.id] = (ctx.repairAllocations[picked.id] ?? 0) + 1;
      target = picked;
    }

    // If target is already at full health (edge case: healed by another creep
    // between ticks), loop once more to pick the next target.
    if (target.hits >= target.hitsMax) {
      creep.memory.repairTargetId = undefined;
      continue;
    }

    const result = creep.repair(target);
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(target, { reusePath: 20 });
    }
    return false;
  }

  return false;
};
