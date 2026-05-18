import { classifyBody } from "utils/bodyClass";

const EMERGENCY_THRESHOLD = 0.3;

interface RoomSlots {
  taskCounts: Partial<Record<string, number>>;
  economyTarget: number;
  hasBuildSites: boolean;
  hasActiveStationaryUpgrader: boolean;
}

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

export const evaluateTask = (creep: Creep, slots: RoomSlots): TaskType => {
  const classify = classifyBody(creep);

  // Specialized body routing
  if (classify === "stationaryHarvester") return "harvestAndDeposit";
  if (classify === "stationaryUpgrader") return "upgradeFromContainer";

  if (classify === "hauler") {
    const hasEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
    if (hasEnergy) return "deposit";
    return "forage";
  }

  // Generic worker path
  const ratio = creep.room.energyAvailable / creep.room.energyCapacityAvailable;

  if (ratio < EMERGENCY_THRESHOLD) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) return "deposit";
    const sources = creep.room.find(FIND_SOURCES_ACTIVE) ;
    assignHarvestSource(creep, sources);
    return "harvest";
  }

  // Slot fill
  const harvestCount = slots.taskCounts.harvest ?? 0;
  if (harvestCount < slots.economyTarget) {
    const sources = creep.room.find(FIND_SOURCES) ;
    assignHarvestSource(creep, sources);
    return "harvest";
  }

  if (!slots.hasActiveStationaryUpgrader && (slots.taskCounts.upgrade ?? 0) < 1) {
    delete creep.memory.sourceId;
    return "upgrade";
  }

  if (slots.hasBuildSites) {
    delete creep.memory.sourceId;
    return "build";
  }

  delete creep.memory.sourceId;
  return "upgrade";
};
