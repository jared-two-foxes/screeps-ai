import { classifyBody } from "utils/bodyClass";

const EMERGENCY_THRESHOLD = 0.3;

const assignHarvestSource = (creep: Creep, sources: Source[]): void => {
  if (creep.memory.sourceId != null) return;
  if (sources.length === 0) return;

  let bestSource: Source | null = null;
  let bestCount = Infinity;

  for (const source of sources) {
    const count = Object.values(Game.creeps).filter(
      (c: Creep) => c.memory.task === "harvest" && c.memory.sourceId === source.id
    ).length;
    if (count < bestCount) {
      bestCount = count;
      bestSource = source;
    }
  }

  if (bestSource != null) {
    creep.memory.sourceId = bestSource.id;
  }
};

/** Build a map of how many harvesters are currently assigned per source. */
const buildHarvesterCountBySource = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const c of Object.values(Game.creeps)) {
    if (c.memory.task === "harvest" && c.memory.sourceId != null) {
      const sid = c.memory.sourceId;
      counts[sid] = (counts[sid] ?? 0) + 1;
    }
  }
  return counts;
};

/**
 * Filter sources to only those with open harvest-deposit slots.
 * Container sources are capped at harvestDepositTileCount; non-container sources are always eligible.
 */
const filterAvailableSources = (sources: Source[], ctx: TickContext): Source[] => {
  const harvesterCountBySource = buildHarvesterCountBySource();
  return sources.filter(source => {
    const info = ctx.sourceContainerMap[source.id];
    if (info == null) return true; // no container → always eligible
    return (harvesterCountBySource[source.id] ?? 0) < info.harvestDepositTileCount;
  });
};

export const evaluateTask = (creep: Creep, ctx: TickContext): TaskType => {
  const slots = ctx.slots;
  const classify = classifyBody(creep);

  // Specialized body routing
  if (classify === "stationaryHarvester") return "harvestAndDeposit";
  if (classify === "stationaryUpgrader") return "upgradeFromContainer";

  if (classify === "hauler") {
    const haulerHasEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
    if (haulerHasEnergy) return "deposit";
    return "forage";
  }

  // Generic worker path
  const ratio = creep.room.energyAvailable / creep.room.energyCapacityAvailable;

  if (ratio < EMERGENCY_THRESHOLD) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) return "deposit";
    const sources = creep.room.find(FIND_SOURCES_ACTIVE);
    const available = filterAvailableSources(sources, ctx);
    if (available.length === 0) {
      delete creep.memory.sourceId;
      return "forage";
    }
    assignHarvestSource(creep, available);
    return "harvest";
  }

  const hasEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;

  // Slot fill — always route empty workers to harvest first
  const harvestCount = slots.taskCounts.harvest ?? 0;
  if (!hasEnergy || harvestCount < slots.economyTarget) {
    const sources = creep.room.find(FIND_SOURCES);
    const available = filterAvailableSources(sources, ctx);
    if (available.length === 0) {
      delete creep.memory.sourceId;
      return "forage";
    }
    assignHarvestSource(creep, available);
    return "harvest";
  }

  // Worker has energy — assign a work task
  if (!slots.hasActiveStationaryUpgrader && (slots.taskCounts.upgrade ?? 0) < 1) {
    delete creep.memory.sourceId;
    return "upgrade";
  }

  if (slots.hasRepairTargets) {
    delete creep.memory.sourceId;
    return "repair";
  }

  if (slots.hasBuildSites) {
    delete creep.memory.sourceId;
    return "build";
  }

  delete creep.memory.sourceId;
  return "upgrade";
};
