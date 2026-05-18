/**
 * Economy utility functions for computing room harvest rates and fleet costs.
 * Does NOT import from spawner.ts.
 */

export const computeRoomHarvestRate = (roomName: string): number => {
  let total = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room !== roomName) continue;
    const task = creep.memory.task;
    if (task !== "harvest" && task !== "harvestAndDeposit") continue;
    total += creep.body.filter((p: { type: BodyPartConstant }) => p.type === WORK).length * 2;
  }
  return total;
};

export const computeFleetMaintenanceCost = (roomName: string): number => {
  let totalCost = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room !== roomName) continue;
    for (const part of creep.body as { type: BodyPartConstant }[]) {
      totalCost += BODYPART_COST[part.type] ?? 0;
    }
  }
  return totalCost / CREEP_LIFE_TIME;
};

export const computeSpecializedHarvestRate = (roomName: string): number => {
  let total = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room !== roomName) continue;
    const workParts = creep.body.filter((p: { type: BodyPartConstant }) => p.type === WORK).length;
    const carryParts = creep.body.filter((p: { type: BodyPartConstant }) => p.type === CARRY).length;
    if (workParts >= 5 && carryParts <= 2) {
      total += workParts * 2;
    }
  }
  return total;
};
