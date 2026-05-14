// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

interface SpawnQueueRole {
  role: CreepMemory["role"];
  body: BodyPartConstant[];
  threshold: number;
  namePrefix: string;
}

const bodies = {
  stationaryHarvester: ["work", "work", "work", "work", "work", "carry", "move"] as BodyPartConstant[],
  hauler: ["carry", "carry", "carry", "carry", "move", "move", "move", "move"] as BodyPartConstant[],
  worker: ["work", "carry", "move"] as BodyPartConstant[]
};

const activeQueue: SpawnQueueRole[] = [
  { role: "stationaryHarvester", body: bodies.stationaryHarvester, threshold: 1, namePrefix: "StatHarvester" },
  { role: "hauler", body: bodies.hauler, threshold: 2, namePrefix: "Hauler" },
  { role: "harvester", body: bodies.worker, threshold: 1, namePrefix: "Harvester" },
  { role: "builder", body: bodies.worker, threshold: 1, namePrefix: "Builder" },
  { role: "upgrader", body: bodies.worker, threshold: 1, namePrefix: "Upgrader" }
];

const inactiveQueue: SpawnQueueRole[] = [
  { role: "harvester", body: bodies.worker, threshold: 2, namePrefix: "Harvester" },
  { role: "builder", body: bodies.worker, threshold: 1, namePrefix: "Builder" },
  { role: "upgrader", body: bodies.worker, threshold: 1, namePrefix: "Upgrader" }
];

// ---------------------------------------------------------------------------
// Readiness — used in production and testable directly
// ---------------------------------------------------------------------------

export const canUseStationaryStrategy = (room: Room): boolean => {
  if (room.energyCapacityAvailable < 600) return false;

  const sources = room.find(FIND_SOURCES);
  return sources.some(source =>
    source.pos.findInRange(FIND_STRUCTURES, 1).some(s => s.structureType === STRUCTURE_CONTAINER)
  );
};

// ---------------------------------------------------------------------------
// Main spawn loop
// ---------------------------------------------------------------------------

export const runSpawner = (): void => {
  // Count creeps per home room (from memory — not current position)
  const roomCounts: Record<string, Record<string, number>> = {};
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    const homeRoom = creep.memory.room;
    if (homeRoom == null) continue;
    if (roomCounts[homeRoom] == null) roomCounts[homeRoom] = {};
    const role = creep.memory.role;
    roomCounts[homeRoom][role] = (roomCounts[homeRoom][role] ?? 0) + 1;
  }

  // Group idle spawns by room
  const spawnsByRoom: Record<string, StructureSpawn[]> = {};
  for (const spawnName in Game.spawns) {
    const spawn = Game.spawns[spawnName];
    if (spawn.spawning !== null) continue;
    const roomName = spawn.room.name;
    if (spawnsByRoom[roomName] == null) spawnsByRoom[roomName] = [];
    spawnsByRoom[roomName].push(spawn);
  }

  // Process each room with idle spawns
  let attemptIndex = 0;
  for (const roomName in spawnsByRoom) {
    const spawns = spawnsByRoom[roomName];
    const room = spawns[0].room;
    const queue = canUseStationaryStrategy(room) ? activeQueue : inactiveQueue;
    const counts: Record<string, number> = roomCounts[roomName] ?? {};

    for (const roleDef of queue) {
      const currentCount = counts[roleDef.role] ?? 0;
      if (currentCount >= roleDef.threshold) continue;

      for (const spawn of spawns) {
        const baseName = `${roleDef.namePrefix}_${Game.time}`;
        const creepName = attemptIndex === 0 ? baseName : `${baseName}_${attemptIndex}`;
        attemptIndex++;
        const result = spawn.spawnCreep(roleDef.body, creepName, {
          memory: {
            role: roleDef.role,
            room: roomName
          }
        });
        if (result === OK) {
          counts[roleDef.role] = (counts[roleDef.role] ?? 0) + 1;
          return;
        }
      }
    }
  }
};
