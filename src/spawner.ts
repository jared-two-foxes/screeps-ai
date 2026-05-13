const harvesterRole = "harvester";
const upgraderRole = "upgrader";
const harvesterThreshold = 2;
const upgraderThreshold = 1;
const harvesterBody: BodyPartConstant[] = ["work", "carry", "move"];
const upgraderBody: BodyPartConstant[] = ["work", "carry", "move"];

interface SpawnPlan {
  role: CreepMemory["role"];
  body: BodyPartConstant[];
  threshold: number;
  count: number;
  namePrefix: string;
}

export const runSpawner = (): void => {
  let harvesterCount = 0;
  let upgraderCount = 0;
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.role === harvesterRole) {
      harvesterCount++;
    } else if (creep.memory.role === upgraderRole) {
      upgraderCount++;
    }
  }

  const plans: SpawnPlan[] = [
    {
      role: harvesterRole,
      body: harvesterBody,
      threshold: harvesterThreshold,
      count: harvesterCount,
      namePrefix: "Harvester"
    },
    {
      role: upgraderRole,
      body: upgraderBody,
      threshold: upgraderThreshold,
      count: upgraderCount,
      namePrefix: "Upgrader"
    }
  ];

  const plan = plans.find(currentPlan => currentPlan.count < currentPlan.threshold);
  if (plan == null) {
    return;
  }

  let attemptIndex = 0;
  for (const spawnName in Game.spawns) {
    const spawn = Game.spawns[spawnName];
    if (spawn.spawning !== null) {
      continue;
    }

    const baseName = `${plan.namePrefix}_${Game.time}`;
    const creepName = attemptIndex === 0 ? baseName : `${baseName}_${attemptIndex}`;
    attemptIndex++;
    const spawnResult = spawn.spawnCreep(plan.body, creepName, {
      memory: {
        role: plan.role,
        room: spawn.room.name
      }
    });

    if (spawnResult === 0) {
      return;
    }
  }
};
