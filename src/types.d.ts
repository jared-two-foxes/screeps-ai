export {};

declare global {
  type TaskType = "harvest" | "deposit" | "upgrade";

  interface Memory {
    uuid: number;
    log: any;
  }

  interface CreepMemory {
    role: "harvester" | "upgrader";
    room: string;
    task?: TaskType;
  }
}
