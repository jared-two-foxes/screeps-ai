export {};

declare global {
  type TaskType = "harvest" | "deposit" | "upgrade" | "harvestAndDeposit" | "forage" | "build" | "upgradeFromContainer";

  interface RoomStats {
    totalCreeps: number;
    byTask: { [task: string]: number };
  }

  interface Memory {
    uuid: number;
    log: any;
    stats: { rooms: { [roomName: string]: RoomStats } };
  }

  interface CreepMemory {
    role?: string;
    room: string;
    task?: TaskType;
    sourceId?: Id<Source>;
    upgradeGathering?: boolean;
  }
}
