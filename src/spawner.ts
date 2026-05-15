// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

const bodies = {
  stationaryHarvester: ["work", "work", "work", "work", "work", "carry", "move"] as BodyPartConstant[],
  hauler: ["carry", "carry", "carry", "carry", "move", "move", "move", "move"] as BodyPartConstant[],
  worker: ["work", "carry", "move"] as BodyPartConstant[]
};

// Per-source WORK saturation cap.
// A source regenerates 3000 energy every 300 ticks; 5 WORK harvests 10 e/tick = 3000 e per cycle.
const SOURCE_WORK_SATURATION = 5;

interface RoomContext {
  room: Room;
  sources: Source[];
  /** WORK parts already assigned per source (by source.id). */
  assignedWorkBySource: Record<string, number>;
  /** Sources with an adjacent built container (eligible for stationary harvesters). */
  containerSourceIds: Set<string>;
  /** Stationary harvester assignment per source.id (count, capped at 1). */
  stationaryBySource: Record<string, number>;
}

interface SpawnQueueRole {
  role: CreepMemory["role"];
  body: BodyPartConstant[];
  namePrefix: string;
  /** Number of creeps this role wants right now for the given room. */
  targetCount: (ctx: RoomContext, counts: Record<string, number>) => number;
  /**
   * Optional selector returning the source ID to pin a new creep to.
   * If returns null, no pinning is recorded.
   */
  pickSourceId?: (ctx: RoomContext) => string | null;
}

// ---------------------------------------------------------------------------
// Per-source accounting
// ---------------------------------------------------------------------------

const countWorkPartsInBody = (body: BodyPartConstant[]): number => {
  let work = 0;
  for (const part of body) {
    if (part === WORK) work++;
  }
  return work;
};

const countWorkParts = (creep: Creep): number => {
  let work = 0;
  for (const part of creep.body) {
    if (part.type === WORK) work++;
  }
  return work;
};

const buildAssignedWorkBySource = (roomName: string): Record<string, number> => {
  const work: Record<string, number> = {};
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.room !== roomName) continue;
    const role = creep.memory.role;
    if (role !== "harvester" && role !== "stationaryHarvester") continue;
    const sourceId = creep.memory.sourceId;
    if (sourceId == null) continue;
    work[sourceId] = (work[sourceId] ?? 0) + countWorkParts(creep);
  }
  return work;
};

const buildStationaryBySource = (roomName: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.room !== roomName) continue;
    if (creep.memory.role !== "stationaryHarvester") continue;
    const sourceId = creep.memory.sourceId;
    if (sourceId == null) continue;
    counts[sourceId] = (counts[sourceId] ?? 0) + 1;
  }
  return counts;
};

const sourcesWithBuiltContainer = (sources: Source[]): Set<string> => {
  const ids = new Set<string>();
  for (const source of sources) {
    const adjacent = source.pos.findInRange(FIND_STRUCTURES, 1);
    if (adjacent.some(s => s.structureType === STRUCTURE_CONTAINER)) {
      ids.add(source.id);
    }
  }
  return ids;
};

const buildRoomContext = (room: Room): RoomContext => {
  const sources = room.find(FIND_SOURCES);
  return {
    room,
    sources,
    assignedWorkBySource: buildAssignedWorkBySource(room.name),
    containerSourceIds: sourcesWithBuiltContainer(sources),
    stationaryBySource: buildStationaryBySource(room.name)
  };
};

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

/** Pick the source with the fewest assigned WORK parts that is below saturation. */
const pickLeastSaturatedSource = (ctx: RoomContext, eligible?: Source[]): string | null => {
  const pool = eligible ?? ctx.sources;
  let bestId: string | null = null;
  let bestWork = Infinity;
  for (const source of pool) {
    const assigned = ctx.assignedWorkBySource[source.id] ?? 0;
    if (assigned >= SOURCE_WORK_SATURATION) continue;
    if (assigned < bestWork) {
      bestWork = assigned;
      bestId = source.id;
    }
  }
  return bestId;
};

/** Pick a source with an adjacent built container that does not yet have a stationary harvester. */
const pickUncoveredStationarySource = (ctx: RoomContext): string | null => {
  for (const source of ctx.sources) {
    if (!ctx.containerSourceIds.has(source.id)) continue;
    if ((ctx.stationaryBySource[source.id] ?? 0) > 0) continue;
    return source.id;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Target-count helpers
// ---------------------------------------------------------------------------

/** Sources not yet covered by a stationary harvester (used for self-harvest fallback). */
const sourcesWithoutStationary = (ctx: RoomContext): Source[] =>
  ctx.sources.filter(source => (ctx.stationaryBySource[source.id] ?? 0) === 0);

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

const activeQueue: SpawnQueueRole[] = [
  {
    role: "stationaryHarvester",
    body: bodies.stationaryHarvester,
    namePrefix: "StatHarvester",
    targetCount: ctx => ctx.containerSourceIds.size,
    pickSourceId: ctx => pickUncoveredStationarySource(ctx)
  },
  {
    role: "hauler",
    body: bodies.hauler,
    namePrefix: "Hauler",
    targetCount: ctx => ctx.containerSourceIds.size + 1
  },
  {
    role: "harvester",
    body: bodies.worker,
    namePrefix: "Harvester",
    // Spawn one more harvester at a time while any uncovered source has WORK slots free.
    targetCount: (ctx, counts) => {
      const eligible = sourcesWithoutStationary(ctx);
      return pickLeastSaturatedSource(ctx, eligible) != null ? (counts.harvester ?? 0) + 1 : 0;
    },
    pickSourceId: ctx => pickLeastSaturatedSource(ctx, sourcesWithoutStationary(ctx))
  },
  {
    role: "builder",
    body: bodies.worker,
    namePrefix: "Builder",
    targetCount: () => 1
  },
  {
    role: "upgrader",
    body: bodies.worker,
    namePrefix: "Upgrader",
    targetCount: () => 1
  }
];

const inactiveQueue: SpawnQueueRole[] = [
  {
    role: "harvester",
    body: bodies.worker,
    namePrefix: "Harvester",
    // Spawn one more harvester at a time while any source has WORK slots free.
    targetCount: (ctx, counts) => (pickLeastSaturatedSource(ctx) != null ? (counts.harvester ?? 0) + 1 : 0),
    pickSourceId: ctx => pickLeastSaturatedSource(ctx)
  },
  {
    role: "builder",
    body: bodies.worker,
    namePrefix: "Builder",
    targetCount: () => 1
  },
  {
    role: "upgrader",
    body: bodies.worker,
    namePrefix: "Upgrader",
    targetCount: () => 1
  }
];

// ---------------------------------------------------------------------------
// Readiness — exported for tests
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

  let attemptIndex = 0;
  for (const roomName in spawnsByRoom) {
    const spawns = spawnsByRoom[roomName];
    const room = spawns[0].room;
    const ctx = buildRoomContext(room);
    const queue = canUseStationaryStrategy(room) ? activeQueue : inactiveQueue;
    const counts: Record<string, number> = roomCounts[roomName] ?? {};

    for (const roleDef of queue) {
      const currentCount = counts[roleDef.role] ?? 0;
      const target = roleDef.targetCount(ctx, counts);
      if (currentCount >= target) continue;

      for (const spawn of spawns) {
        const baseName = `${roleDef.namePrefix}_${Game.time}`;
        const creepName = attemptIndex === 0 ? baseName : `${baseName}_${attemptIndex}`;
        attemptIndex++;

        const memory: CreepMemory = {
          role: roleDef.role,
          room: roomName
        };
        if (roleDef.pickSourceId != null) {
          const sourceId = roleDef.pickSourceId(ctx);
          if (sourceId != null) {
            memory.sourceId = sourceId as Id<Source>;
          }
        }

        const result = spawn.spawnCreep(roleDef.body, creepName, { memory });
        if (result === OK) {
          counts[roleDef.role] = currentCount + 1;
          // Update per-source accounting so subsequent spawns this tick don't double-assign.
          if (memory.sourceId != null) {
            const pickedId = memory.sourceId;
            const work = countWorkPartsInBody(roleDef.body);
            ctx.assignedWorkBySource[pickedId] = (ctx.assignedWorkBySource[pickedId] ?? 0) + work;
            if (roleDef.role === "stationaryHarvester") {
              ctx.stationaryBySource[pickedId] = (ctx.stationaryBySource[pickedId] ?? 0) + 1;
            }
          }
          return;
        }
      }
    }
  }
};
