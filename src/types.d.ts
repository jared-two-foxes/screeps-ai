export {};

declare global {
  type TaskType = "harvest" | "deposit" | "upgrade" | "harvestAndDeposit" | "forage" | "build" | "upgradeFromContainer";

  interface RoomStats {
    totalCreeps: number;
    byTask: { [task: string]: number };
  }

  interface ExtensionPlanEntry {
    rcl: number;
    sites: Array<{ x: number; y: number }>;
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
    upgradeGathering?: boolean;
  }
}
