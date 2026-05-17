// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

const MINE_TIME = 25;
const DOUBLE_BODY_THRESHOLD = 400;
const CREEP_LIFE_TIME = 1500;

const bodies = {
  stationaryHarvester: ["work", "work", "work", "work", "work", "carry", "move"] as BodyPartConstant[],
  hauler: ["carry", "carry", "carry", "carry", "move", "move", "move", "move"] as BodyPartConstant[],
  worker: ["work", "carry", "move"] as BodyPartConstant[],
  workerDouble: ["work", "carry", "move", "work", "carry", "move"] as BodyPartConstant[]
};

// Per-source WORK saturation cap.
// A source regenerates 3000 energy every 300 ticks; 5 WORK harvests 10 e/tick = 3000 e per cycle.
const SOURCE_WORK_SATURATION = 5;

const pathDistanceCache = new Map<string, number>();

export const clearDistanceCache = (): void => {
  pathDistanceCache.clear();
};

interface RoomContext {
  room: Room;
  sources: Source[];
  workerBody: BodyPartConstant[];
  /** WORK parts already assigned per source (by source.id). */
  assignedWorkBySource: Record<string, number>;
  /** Harvesting-role creep count already assigned per source (by source.id). */
  assignedCreepCountBySource: Record<string, number>;
  /** Source IDs dedicated to spawn-supply. */
  spawnSourceIds: string[];
  /** Source IDs dedicated to controller-supply. */
  controllerSourceIds: string[];
  /** Required WORK cap per source.id. */
  neededWorkCapPerSource: Record<string, number>;
  /** Upgrader assignment per source.id. */
  upgradersPerSource: Record<string, number>;
  /** Sources with an adjacent built container (eligible for stationary harvesters). */
  containerSourceIds: Set<string>;
  /** Stationary harvester assignment per source.id (count, capped at 1). */
  stationaryBySource: Record<string, number>;
  /** Count of non-wall adjacent tiles per source.id (physical creep cap). */
  walkableTilesBySource: Record<string, number>;
}

interface SpawnQueueRole {
  role: CreepMemory["role"];
  body: (ctx: RoomContext) => BodyPartConstant[];
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

export const calcBodyCost = (body: BodyPartConstant[]): number => {
  let total = 0;
  for (const part of body) {
    total += BODYPART_COST[part];
  }
  return total;
};

export const selectWorkerBody = (room: Room): BodyPartConstant[] =>
  room.energyCapacityAvailable >= DOUBLE_BODY_THRESHOLD ? bodies.workerDouble : bodies.worker;

const positionKey = (pos: RoomPosition): string => `${pos.roomName}:${pos.x},${pos.y}`;

const cacheKeyForDistance = (from: RoomPosition, to: RoomPosition): string =>
  `${positionKey(from)}->${positionKey(to)}`;

const chebyshevDistance = (from: RoomPosition, to: RoomPosition): number =>
  Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));

const getPathDistance = (from: RoomPosition, to: RoomPosition): number => {
  const key = cacheKeyForDistance(from, to);
  const cached = pathDistanceCache.get(key);
  if (cached != null) return cached;

  const result = PathFinder.search(from, { pos: to, range: 1 }, { ignoreCreeps: true } as unknown as PathFinderOpts);
  const distance = result.incomplete ? chebyshevDistance(from, to) : result.path.length;
  pathDistanceCache.set(key, distance);
  return distance;
};

interface SourceClassification {
  spawnSourceIds: string[];
  controllerSourceIds: string[];
}

export const classifySources = (
  sources: Source[],
  spawnPos: RoomPosition | undefined,
  controllerPos: RoomPosition | undefined
): SourceClassification => {
  if (sources.length === 0) {
    return { spawnSourceIds: [], controllerSourceIds: [] };
  }

  // No spawn anchor means default everything to spawn-supply.
  if (spawnPos == null) {
    return { spawnSourceIds: sources.map(source => source.id), controllerSourceIds: [] };
  }

  // Without a controller anchor, keep all sources on spawn-supply.
  if (controllerPos == null) {
    return { spawnSourceIds: sources.map(source => source.id), controllerSourceIds: [] };
  }

  if (sources.length === 1) {
    return { spawnSourceIds: [sources[0].id], controllerSourceIds: [] };
  }

  if (sources.length === 2) {
    const sorted = [...sources].sort((a, b) => {
      const scoreA = getPathDistance(spawnPos, a.pos) - getPathDistance(controllerPos, a.pos);
      const scoreB = getPathDistance(spawnPos, b.pos) - getPathDistance(controllerPos, b.pos);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.id.localeCompare(b.id);
    });
    return {
      spawnSourceIds: [sorted[0].id],
      controllerSourceIds: [sorted[1].id]
    };
  }

  const controllerSource = [...sources].sort((a, b) => {
    const aDistance = getPathDistance(controllerPos, a.pos);
    const bDistance = getPathDistance(controllerPos, b.pos);
    if (aDistance !== bDistance) return aDistance - bDistance;
    return a.id.localeCompare(b.id);
  })[0];

  return {
    spawnSourceIds: sources.filter(source => source.id !== controllerSource.id).map(source => source.id),
    controllerSourceIds: [controllerSource.id]
  };
};

export const calcNeededHarvestersForSource = (source: Source, spawnPos: RoomPosition, workPerCreep: number): number => {
  const d = getPathDistance(spawnPos, source.pos);
  const cycleTime = MINE_TIME + 3 * d;
  return Math.ceil((5 * cycleTime) / (MINE_TIME * Math.max(workPerCreep, 1)));
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
    if (role !== "harvester" && role !== "stationaryHarvester" && role !== "miner") continue;
    const sourceId = creep.memory.sourceId;
    if (sourceId == null) continue;
    work[sourceId] = (work[sourceId] ?? 0) + countWorkParts(creep);
  }
  return work;
};

const buildUpgradersPerSource = (roomName: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.room !== roomName) continue;
    if (creep.memory.role !== "upgrader") continue;
    const sourceId = creep.memory.sourceId;
    if (sourceId == null) continue;
    counts[sourceId] = (counts[sourceId] ?? 0) + 1;
  }
  return counts;
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

const buildAssignedCreepCountBySource = (roomName: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.room !== roomName) continue;
    const role = creep.memory.role;
    if (role !== "harvester" && role !== "stationaryHarvester" && role !== "miner") continue;
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

export const countWalkableAdjacentTiles = (room: Room, source: Source): number => {
  const terrain = room.getTerrain();
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = source.pos.x + dx;
      const y = source.pos.y + dy;
      if (x < 0 || x > 49 || y < 0 || y > 49) continue;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      count++;
    }
  }
  return count;
};

const buildRoomContext = (room: Room): RoomContext => {
  const sources = room.find(FIND_SOURCES);
  const workerBody = selectWorkerBody(room);
  const workPerCreep = countWorkPartsInBody(workerBody);
  const spawnPos = room.find(FIND_MY_SPAWNS)[0]?.pos;
  const classification = classifySources(sources, spawnPos, room.controller?.pos);
  // Compute containerSourceIds first — needed to choose the correct WORK cap formula.
  const containerSourceIds = sourcesWithBuiltContainer(sources);
  const neededWorkCapPerSource: Record<string, number> = {};

  for (const source of sources) {
    // Non-container sources require extra harvesters to cover travel time.
    // Container sources need only SOURCE_WORK_SATURATION WORK parts (harvester stays put).
    if (spawnPos != null && !containerSourceIds.has(source.id)) {
      const neededHarvesters = calcNeededHarvestersForSource(source, spawnPos, workPerCreep);
      neededWorkCapPerSource[source.id] = neededHarvesters * Math.max(workPerCreep, 1);
    } else {
      neededWorkCapPerSource[source.id] = SOURCE_WORK_SATURATION;
    }
  }

  const walkableTilesBySource: Record<string, number> = {};
  for (const source of sources) {
    walkableTilesBySource[source.id] = countWalkableAdjacentTiles(room, source);
  }

  return {
    room,
    sources,
    workerBody,
    assignedWorkBySource: buildAssignedWorkBySource(room.name),
    assignedCreepCountBySource: buildAssignedCreepCountBySource(room.name),
    spawnSourceIds: classification.spawnSourceIds,
    controllerSourceIds: classification.controllerSourceIds,
    neededWorkCapPerSource,
    upgradersPerSource: buildUpgradersPerSource(room.name),
    containerSourceIds,
    stationaryBySource: buildStationaryBySource(room.name),
    walkableTilesBySource
  };
};

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

/** Pick the source with the lowest saturation that is below its cap. */
const pickLeastSaturatedSource = (
  ctx: RoomContext,
  eligible?: Source[],
  caps?: Record<string, number>
): string | null => {
  const pool = eligible ?? ctx.sources;
  const effectiveCaps = caps ?? ctx.neededWorkCapPerSource;
  let bestId: string | null = null;
  let bestSaturation = Infinity;
  let bestAssigned = Infinity;
  for (const source of pool) {
    const cap = effectiveCaps[source.id] ?? SOURCE_WORK_SATURATION;
    const assigned = ctx.assignedWorkBySource[source.id] ?? 0;
    if (assigned >= cap) continue;
    // Physical tile cap: never assign more creeps than walkable adjacent tiles.
    const tileCap = ctx.walkableTilesBySource[source.id] ?? 8;
    const creepCount = ctx.assignedCreepCountBySource[source.id] ?? 0;
    if (creepCount >= tileCap) continue;
    const saturation = assigned / Math.max(cap, 1);

    if (saturation < bestSaturation) {
      bestSaturation = saturation;
      bestAssigned = assigned;
      bestId = source.id;
      continue;
    }

    if (saturation === bestSaturation) {
      if (assigned < bestAssigned) {
        bestAssigned = assigned;
        bestId = source.id;
        continue;
      }

      if (assigned === bestAssigned && bestId != null && source.id.localeCompare(bestId) < 0) {
        bestId = source.id;
      }
    }
  }
  return bestId;
};

const pickLeastSaturatedControllerSource = (ctx: RoomContext): string | null => {
  if (ctx.controllerSourceIds.length === 0) return null;

  let bestId: string | null = null;
  let bestCount = Infinity;
  for (const sourceId of ctx.controllerSourceIds) {
    const count = ctx.upgradersPerSource[sourceId] ?? 0;
    if (count < bestCount) {
      bestCount = count;
      bestId = sourceId;
      continue;
    }
    if (count === bestCount && bestId != null && sourceId.localeCompare(bestId) < 0) {
      bestId = sourceId;
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

/** Spawn-proximate sources used by container/active queues and upgrader-gating helpers. */
const spawnSupplySources = (ctx: RoomContext): Source[] =>
  ctx.spawnSourceIds.map(id => ctx.sources.find(s => s.id === id)).filter((s): s is Source => s != null);

const sourcesWithoutStationary = (ctx: RoomContext): Source[] =>
  spawnSupplySources(ctx).filter(source => (ctx.stationaryBySource[source.id] ?? 0) === 0);

export const areSpawnSourcesSaturated = (ctx: RoomContext, counts: Record<string, number>): boolean => {
  void counts;
  for (const sourceId of ctx.spawnSourceIds) {
    const assigned = ctx.assignedWorkBySource[sourceId] ?? 0;
    const required = ctx.neededWorkCapPerSource[sourceId] ?? SOURCE_WORK_SATURATION;
    if (assigned < required) return false;
  }
  return true;
};

export const canSupportAnotherUpgrader = (ctx: RoomContext, counts: Record<string, number>): boolean => {
  if (!areSpawnSourcesSaturated(ctx, counts)) return false;

  const harvestRate = Object.values(ctx.assignedWorkBySource).reduce((sum, work) => sum + work, 0) * 2;

  let fleetCost = 0;
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.room !== ctx.room.name) continue;
    const body = creep.body.map(part => part.type);
    fleetCost += calcBodyCost(body);
  }

  const maintenanceCostPerTick = fleetCost / CREEP_LIFE_TIME;
  const nextUpgraderCostPerTick = calcBodyCost(ctx.workerBody) / CREEP_LIFE_TIME;
  return harvestRate - maintenanceCostPerTick >= nextUpgraderCostPerTick;
};

/**
 * Returns true when the room's harvest surplus (after fleet maintenance) can
 * cover the amortised cost of one additional builder body.
 *
 * Intentionally does NOT require areSpawnSourcesSaturated — builders are
 * useful earlier in a room's lifecycle than a second upgrader.
 */
export const canSupportAnotherBuilder = (ctx: RoomContext): boolean => {
  const harvestRate = Object.values(ctx.assignedWorkBySource).reduce((sum, work) => sum + work, 0) * 2;

  let fleetCost = 0;
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    if (creep.memory.room !== ctx.room.name) continue;
    const body = creep.body.map((part: { type: BodyPartConstant }) => part.type);
    fleetCost += calcBodyCost(body);
  }

  const maintenanceCostPerTick = fleetCost / CREEP_LIFE_TIME;
  const nextBuilderCostPerTick = calcBodyCost(ctx.workerBody) / CREEP_LIFE_TIME;
  return harvestRate - maintenanceCostPerTick >= nextBuilderCostPerTick;
};

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

const activeQueue: SpawnQueueRole[] = [
  {
    role: "stationaryHarvester",
    body: () => bodies.stationaryHarvester,
    namePrefix: "StatHarvester",
    targetCount: ctx => ctx.containerSourceIds.size,
    pickSourceId: ctx => pickUncoveredStationarySource(ctx)
  },
  {
    role: "hauler",
    body: () => bodies.hauler,
    namePrefix: "Hauler",
    targetCount: ctx => ctx.containerSourceIds.size + 1
  },
  {
    role: "harvester",
    body: ctx => ctx.workerBody,
    namePrefix: "Harvester",
    // Spawn one more harvester at a time while any uncovered source has WORK slots free.
    targetCount: (ctx, counts) => {
      const eligible = sourcesWithoutStationary(ctx);
      return pickLeastSaturatedSource(ctx, eligible, ctx.neededWorkCapPerSource) != null
        ? (counts.harvester ?? 0) + 1
        : 0;
    },
    pickSourceId: ctx => pickLeastSaturatedSource(ctx, sourcesWithoutStationary(ctx), ctx.neededWorkCapPerSource)
  },
  {
    role: "builder",
    body: ctx => ctx.workerBody,
    namePrefix: "Builder",
    targetCount: (ctx, counts) => canSupportAnotherBuilder(ctx) ? Math.min((counts.builder ?? 0) + 1, 2) : 1
  },
  {
    role: "upgrader",
    body: ctx => ctx.workerBody,
    namePrefix: "Upgrader",
    targetCount: (ctx, counts) =>
      canSupportAnotherUpgrader(ctx, counts) ? (counts.upgrader ?? 0) + 1 : Math.min(counts.upgrader ?? 0, 1),
    pickSourceId: ctx => pickLeastSaturatedControllerSource(ctx)
  }
];

const inactiveQueue: SpawnQueueRole[] = [
  {
    role: "harvester",
    body: ctx => ctx.workerBody,
    namePrefix: "Harvester",
    targetCount: ctx => {
      const workPerCreep = Math.max(countWorkPartsInBody(ctx.workerBody), 1);
      return ctx.sources.reduce((sum, source) => {
        const workCap = ctx.neededWorkCapPerSource[source.id] ?? SOURCE_WORK_SATURATION;
        return sum + Math.min(Math.ceil(workCap / workPerCreep), SOURCE_WORK_SATURATION);
      }, 0);
    },
    pickSourceId: ctx => pickLeastSaturatedSource(ctx, ctx.sources, ctx.neededWorkCapPerSource)
  },
  {
    role: "builder",
    body: ctx => ctx.workerBody,
    namePrefix: "Builder",
    targetCount: (ctx, counts) => canSupportAnotherBuilder(ctx) ? Math.min((counts.builder ?? 0) + 1, 2) : 1
  },
  {
    role: "upgrader",
    body: ctx => ctx.workerBody,
    namePrefix: "Upgrader",
    targetCount: (ctx, counts) =>
      canSupportAnotherUpgrader(ctx, counts) ? (counts.upgrader ?? 0) + 1 : Math.min(counts.upgrader ?? 0, 1),
    pickSourceId: ctx => pickLeastSaturatedControllerSource(ctx)
  }
];

/**
 * Intermediate queue: activates as soon as any source has a built container.
 * Worker-body harvesters dump energy into the container; haulers ferry it to
 * spawn/storage.  Cheaper than full stationaryHarvester bodies so this tier
 * can engage at RCL 2 without waiting for 600-energy capacity.
 */
const containerQueue: SpawnQueueRole[] = [
  {
    role: "harvester",
    body: ctx => ctx.workerBody,
    namePrefix: "Harvester",
    targetCount: ctx => {
      const workPerCreep = Math.max(countWorkPartsInBody(ctx.workerBody), 1);
      return ctx.sources.reduce((sum, source) => {
        // Container sources: harvesters stay put, no travel time — only
        // SOURCE_WORK_SATURATION WORK parts needed to fully saturate.
        // Non-container sources: keep the distance-based travel-time formula.
        const workCap = ctx.containerSourceIds.has(source.id)
          ? SOURCE_WORK_SATURATION
          : (ctx.neededWorkCapPerSource[source.id] ?? SOURCE_WORK_SATURATION);
        return sum + Math.min(Math.ceil(workCap / workPerCreep), SOURCE_WORK_SATURATION);
      }, 0);
    },
    pickSourceId: ctx => {
      const caps: Record<string, number> = {};
      for (const source of ctx.sources) {
        caps[source.id] = ctx.containerSourceIds.has(source.id)
          ? SOURCE_WORK_SATURATION
          : (ctx.neededWorkCapPerSource[source.id] ?? SOURCE_WORK_SATURATION);
      }
      return pickLeastSaturatedSource(ctx, ctx.sources, caps);
    }
  },
  {
    role: "hauler",
    body: () => bodies.hauler,
    namePrefix: "Hauler",
    targetCount: ctx => ctx.containerSourceIds.size + 1
  },
  {
    role: "builder",
    body: ctx => ctx.workerBody,
    namePrefix: "Builder",
    targetCount: (ctx, counts) => canSupportAnotherBuilder(ctx) ? Math.min((counts.builder ?? 0) + 1, 2) : 1
  },
  {
    role: "upgrader",
    body: ctx => ctx.workerBody,
    namePrefix: "Upgrader",
    targetCount: (ctx, counts) =>
      canSupportAnotherUpgrader(ctx, counts) ? (counts.upgrader ?? 0) + 1 : Math.min(counts.upgrader ?? 0, 1),
    pickSourceId: ctx => pickLeastSaturatedControllerSource(ctx)
  }
];

// ---------------------------------------------------------------------------
// Readiness — exported for tests
// ---------------------------------------------------------------------------

/**
 * True as soon as any source has a built adjacent container, regardless of
 * energy capacity.  Activates the intermediate container-harvester + hauler
 * strategy before the room can afford full stationary-harvester bodies.
 */
export const canUseContainerStrategy = (room: Room): boolean => {
  const sources = room.find(FIND_SOURCES);
  return sources.some(source =>
    source.pos.findInRange(FIND_STRUCTURES, 1).some(s => s.structureType === STRUCTURE_CONTAINER)
  );
};

export const canUseStationaryStrategy = (room: Room): boolean => {
  if (room.energyCapacityAvailable < 600) return false;
  return canUseContainerStrategy(room);
};

/**
 * Returns true when income minus fleet maintenance covers the amortised cost
 * of a new stationaryHarvester body.
 */
export const incomePermitsHeavyMiner = (
  harvestRate: number,
  fleetMaintenanceCost: number,
  stationaryHarvesterBodyCost: number
): boolean => harvestRate - fleetMaintenanceCost >= stationaryHarvesterBodyCost / CREEP_LIFE_TIME;

/**
 * Returns true when surplus income (after existing upgrader maintenance) is
 * enough to cover at least one additional upgrader — meaning the room can
 * afford to build extensions / grow.
 *
 * Note: this formula is intentionally stricter than canSupportAnotherUpgrader.
 * It deducts existing upgrader maintenance before comparing.
 */
export const canBuildExpansions = (
  harvestRate: number,
  fleetMaintenanceCost: number,
  workerBodyCost: number,
  upgraderCount: number
): boolean => {
  const amortised = workerBodyCost / CREEP_LIFE_TIME;
  const remaining = harvestRate - fleetMaintenanceCost - upgraderCount * amortised;
  return remaining >= amortised;
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
    const queue = canUseStationaryStrategy(room) ? activeQueue
      : canUseContainerStrategy(room) ? containerQueue
      : inactiveQueue;
    const counts: Record<string, number> = roomCounts[roomName] ?? {};

    const usedSpawns = new Set<StructureSpawn>();

    for (const roleDef of queue) {
      const currentCount = counts[roleDef.role] ?? 0;
      const target = roleDef.targetCount(ctx, counts);
      if (currentCount >= target) continue;

      for (const spawn of spawns) {
        if (usedSpawns.has(spawn)) continue; // skip spawns already used this tick
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

        const body = roleDef.body(ctx);
        const result = spawn.spawnCreep(body, creepName, { memory });
        if (result === OK) {
          counts[roleDef.role] = currentCount + 1;
          // Update per-source accounting so subsequent spawns this tick don't double-assign.
          if (memory.sourceId != null && (roleDef.role === "harvester" || roleDef.role === "stationaryHarvester" || roleDef.role === "miner")) {
            const pickedId = memory.sourceId;
            const work = countWorkPartsInBody(body);
            ctx.assignedWorkBySource[pickedId] = (ctx.assignedWorkBySource[pickedId] ?? 0) + work;
            ctx.assignedCreepCountBySource[pickedId] = (ctx.assignedCreepCountBySource[pickedId] ?? 0) + 1;
            if (roleDef.role === "stationaryHarvester") {
              ctx.stationaryBySource[pickedId] = (ctx.stationaryBySource[pickedId] ?? 0) + 1;
            }
          }
          if (memory.sourceId != null && roleDef.role === "upgrader") {
            const pickedId = memory.sourceId;
            ctx.upgradersPerSource[pickedId] = (ctx.upgradersPerSource[pickedId] ?? 0) + 1;
          }
          usedSpawns.add(spawn);
          break; // done with this role; continue outer loop
        }
      }
    }
  }
};
