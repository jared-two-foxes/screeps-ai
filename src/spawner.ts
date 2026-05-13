const harvesterRole = "harvester";
const harvesterThreshold = 2;
const harvesterBody: BodyPartConstant[] = ["work", "carry", "move"];

export const runSpawner = (): void => {
  let harvesterCount = 0;
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.role === harvesterRole) {
      harvesterCount++;
    }
  }

  if (harvesterCount >= harvesterThreshold) {
    return;
  }

  let attemptIndex = 0;
  for (const spawnName in Game.spawns) {
    const spawn = Game.spawns[spawnName];
    if (spawn.spawning !== null) {
      continue;
    }

    const baseName = `Harvester_${Game.time}`;
    const creepName = attemptIndex === 0 ? baseName : `${baseName}_${attemptIndex}`;
    attemptIndex++;
    const spawnResult = spawn.spawnCreep(harvesterBody, creepName, {
      memory: {
        role: harvesterRole,
        room: spawn.room.name,
        working: false
      }
    });

    if (spawnResult === 0) {
      return;
    }
  }
};
