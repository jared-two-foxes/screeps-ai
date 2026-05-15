export {};

declare global {
  type TaskType = "harvest" | "deposit" | "upgrade" | "harvestAndDeposit" | "forage" | "build";

  interface Memory {
    uuid: number;
    log: any;
  }

  interface CreepMemory {
    role: "harvester" | "upgrader" | "stationaryHarvester" | "hauler" | "builder";
    room: string;
    task?: TaskType;
    sourceId?: Id<Source>;
  }
}
