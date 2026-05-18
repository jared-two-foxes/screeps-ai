export type BodyClass = "stationaryHarvester" | "stationaryUpgrader" | "hauler" | "worker";

/**
 * Classify a creep's body into a functional category.
 * Counts ALL parts regardless of damage (hits value is ignored).
 *
 * - hauler:             0 WORK parts
 * - stationaryHarvester: WORK >= 5 AND CARRY <= 2
 * - stationaryUpgrader:  WORK >= 5 AND CARRY > 2
 * - worker:             everything else (WORK < 5)
 */
export const classifyBody = (creep: { body: { type: string }[] }): BodyClass => {
  let workCount = 0;
  let carryCount = 0;

  for (const part of (creep.body ?? [])) {
    if (part.type === WORK) workCount++;
    else if (part.type === CARRY) carryCount++;
  }

  if (workCount === 0) return "hauler";
  if (workCount >= 5 && carryCount <= 2) return "stationaryHarvester";
  if (workCount >= 5 && carryCount > 2) return "stationaryUpgrader";
  return "worker";
};
