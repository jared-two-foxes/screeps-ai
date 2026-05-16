export {};

declare global {
  type TaskType = "harvest" | "deposit" | "upgrade" | "harvestAndDeposit" | "forage" | "build";

  interface RoomStats {
    totalCreeps: number;
    byRole: { [role: string]: number };
  }

  interface Memory {
    uuid: number;
    log: any;
    stats: { rooms: { [roomName: string]: RoomStats } };
  }

  interface CreepMemory {
    role: "harvester" | "upgrader" | "stationaryHarvester" | "hauler" | "builder" | "miner";
    room: string;
    task?: TaskType;
    sourceId?: Id<Source>;
    upgradeGathering?: boolean;
  }
}
