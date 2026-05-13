export {};

declare global {
  interface Memory {
    uuid: number;
    log: any;
  }

  interface CreepMemory {
    role: "harvester" | "upgrader";
    room: string;
    working?: boolean;
  }
}
