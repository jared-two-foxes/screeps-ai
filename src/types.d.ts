export {};

declare global {
  type TaskType = "harvest" | "deposit" | "upgrade" | "harvestAndDeposit" | "forage" | "build" | "upgradeFromContainer" | "repair";

  interface RoomStats {
    totalCreeps: number;
    byTask: { [task: string]: number };
  }

  interface ExtensionPlanEntry {
    rcl: number;
    sites: { x: number; y: number }[];
  }

  interface Memory {
    uuid: number;
    log: any;
    stats: { rooms: { [roomName: string]: RoomStats } };
    extensionPlan: { [roomName: string]: ExtensionPlanEntry };
  }

  interface CreepMemory {
    role?: string;
    room: string;
    task?: TaskType;
    sourceId?: Id<Source>;
    obtainedFromId?: Id<StructureContainer>;
    /** Cached deposit target — cleared on task completion or when target is full/gone. */
    depositTargetId?: Id<StructureExtension | StructureSpawn | StructureStorage>;
    /** Cached forage target — cleared on task completion or when target is empty/gone. */
    forageTargetId?: Id<StructureContainer | Resource>;
    /** Cached construction site target — cleared on task completion or when site is gone. */
    buildSiteId?: Id<ConstructionSite>;
    /** Cached repair target — cleared when fully repaired, gone, or energy runs out. */
    repairTargetId?: Id<AnyStructure>;
  }

  interface RoomSlots {
    taskCounts: Partial<Record<string, number>>;
    economyTarget: number;
    hasBuildSites: boolean;
    hasActiveStationaryUpgrader: boolean;
    hasRepairTargets: boolean;
  }

  interface TickContext {
    slots: RoomSlots;
    repairAllocations: Record<string, number>;
  }
}
