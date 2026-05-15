import { assert } from "chai";
import { canUseStationaryStrategy, runSpawner } from "../../src/spawner";
import { Game, Memory } from "./mock";

interface SpawnCall {
  body: BodyPartConstant[];
  name: string;
  memory: CreepMemory | undefined;
}

interface MockRoom {
  name: string;
  energyCapacityAvailable: number;
  find: (constant: number) => any[];
}

interface MockSpawn {
  room: MockRoom;
  spawning: object | null;
  calls: SpawnCall[];
  spawnCreep: (body: BodyPartConstant[], name: string, options: SpawnOptions) => number;
}

interface MockSpawnOptions {
  roomName?: string;
  spawning?: object | null;
  returnCode?: number;
  energyCapacityAvailable?: number;
  sources?: any[];
}

const bareSource = (id: string = "source-bare"): any => ({
  id,
  pos: {
    findInRange: (constant: number, _range: number): any[] => {
      if (constant === (global as any).FIND_STRUCTURES) return [];
      return [];
    }
  }
});

const createMockSpawn = (options: MockSpawnOptions = {}): MockSpawn => {
  const roomName = options.roomName ?? "W1N1";
  const spawning = options.spawning ?? null;
  const returnCode = options.returnCode ?? 0;
  const energyCapacityAvailable = options.energyCapacityAvailable ?? 300;
  const sources = options.sources ?? [bareSource()];
  const calls: SpawnCall[] = [];
  return {
    room: {
      name: roomName,
      energyCapacityAvailable,
      find: (constant: number): any[] => {
        if (constant === (global as any).FIND_SOURCES) return sources;
        return [];
      }
    },
    spawning,
    calls,
    spawnCreep: (body: BodyPartConstant[], name: string, _opts: SpawnOptions): number => {
      calls.push({
        body,
        name,
        memory: _opts.memory
      });
      return returnCode;
    }
  };
};

const makeSource = (adjacent: any[], id: string = "source-1"): any => ({
  id,
  pos: {
    findInRange: (constant: number, _range: number): any[] => {
      if (constant === (global as any).FIND_STRUCTURES) return adjacent;
      return [];
    }
  }
});

const harvesterCreep = (room: string, sourceId: string = "source-bare"): any => ({
  memory: { role: "harvester", room, sourceId },
  body: [{ type: "work" }, { type: "carry" }, { type: "move" }]
});

describe("spawner", () => {
  beforeEach(() => {
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_STRUCTURES = 2;
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).OK = 0;
    (global as any).ERR_NOT_ENOUGH_ENERGY = -6;
    (global as any).WORK = "work";
    (global as any).CARRY = "carry";
    (global as any).MOVE = "move";
  });

  describe("canUseStationaryStrategy", () => {
    const buildRoom = (energyCapacityAvailable: number, sources: any[]): any => ({
      energyCapacityAvailable,
      find: (constant: number): any[] => (constant === (global as any).FIND_SOURCES ? sources : [])
    });

    it("returns false when energy capacity is below 600 even with adjacent container", () => {
      const source = makeSource([{ structureType: "container" }]);
      assert.isFalse(canUseStationaryStrategy(buildRoom(500, [source])));
    });

    it("returns false when energy capacity is at least 600 but no source has adjacent container", () => {
      const source = makeSource([]);
      assert.isFalse(canUseStationaryStrategy(buildRoom(600, [source])));
    });

    it("returns true when energy capacity is at least 600 and any source has an adjacent built container", () => {
      const sourceA = makeSource([]);
      const sourceB = makeSource([{ structureType: "container" }]);
      assert.isTrue(canUseStationaryStrategy(buildRoom(600, [sourceA, sourceB])));
    });

    it("returns false when only an adjacent non-container structure exists", () => {
      const source = makeSource([{ structureType: "extension" }]);
      assert.isFalse(canUseStationaryStrategy(buildRoom(600, [source])));
    });

    it("returns false when no sources exist in the room", () => {
      assert.isFalse(canUseStationaryStrategy(buildRoom(600, [])));
    });
  });

  describe("runSpawner — inactive queue", () => {
    it("spawns a harvester when below threshold", () => {
      const spawn = createMockSpawn();
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.time = 12345;

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.deepEqual(spawn.calls[0].body, ["work", "carry", "move"]);
      assert.equal(spawn.calls[0].name, "Harvester_12345");
      assert.equal(spawn.calls[0].memory?.role, "harvester");
      assert.equal(spawn.calls[0].memory?.room, "W1N1");
    });

    it("spawns an upgrader when harvester threshold is met and upgrader threshold is not met", () => {
      const spawn = createMockSpawn();
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.time = 12345;
      (global as any).Game.creeps = {
        Harvester1: harvesterCreep("W1N1"),
        Harvester2: harvesterCreep("W1N1"),
        Harvester3: harvesterCreep("W1N1"),
        Harvester4: harvesterCreep("W1N1"),
        Harvester5: harvesterCreep("W1N1"),
        Builder1: { memory: { role: "builder", room: "W1N1" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.match(spawn.calls[0].name, /^Upgrader_12345/);
      assert.equal(spawn.calls[0].memory?.role, "upgrader");
      assert.equal(spawn.calls[0].memory?.room, "W1N1");
    });

    it("does not spawn when all inactive-queue thresholds are met", () => {
      const spawn = createMockSpawn();
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        Harvester1: harvesterCreep("W1N1"),
        Harvester2: harvesterCreep("W1N1"),
        Harvester3: harvesterCreep("W1N1"),
        Harvester4: harvesterCreep("W1N1"),
        Harvester5: harvesterCreep("W1N1"),
        Builder1: { memory: { role: "builder", room: "W1N1" } },
        Upgrader1: { memory: { role: "upgrader", room: "W1N1" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 0);
    });

    it("prioritizes spawning harvesters when all roles are below threshold", () => {
      const spawn = createMockSpawn();
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.time = 777;
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].name, "Harvester_777");
      assert.equal(spawn.calls[0].memory?.role, "harvester");
    });
  });

  describe("runSpawner — active queue", () => {
    const sourceWithContainer = (): any => makeSource([{ structureType: "container" }]);

    it("spawns a stationaryHarvester first when active strategy is available", () => {
      const spawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [sourceWithContainer()] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.time = 555;
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.deepEqual(spawn.calls[0].body, ["work", "work", "work", "work", "work", "carry", "move"]);
      assert.equal(spawn.calls[0].memory?.role, "stationaryHarvester");
      assert.match(spawn.calls[0].name, /^StatHarvester_555/);
    });

    it("spawns hauler after stationaryHarvester threshold is met", () => {
      const spawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [sourceWithContainer()] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.time = 600;
      (global as any).Game.creeps = {
        SH1: { memory: { role: "stationaryHarvester", room: "W1N1" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.deepEqual(spawn.calls[0].body, ["carry", "carry", "carry", "carry", "move", "move", "move", "move"]);
      assert.equal(spawn.calls[0].memory?.role, "hauler");
    });

    it("spawns builder when stationary, hauler, and harvester targets are all met in active queue", () => {
      const source = sourceWithContainer();
      const spawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [source] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        SH1: {
          memory: { role: "stationaryHarvester", room: "W1N1", sourceId: source.id },
          body: [
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "carry" },
            { type: "move" }
          ]
        },
        H1: { memory: { role: "hauler", room: "W1N1" } },
        H2: { memory: { role: "hauler", room: "W1N1" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "builder");
    });

    it("falls through to next role when top-priority role spawn fails", () => {
      // First call (stationaryHarvester) returns ERR_NOT_ENOUGH_ENERGY (-6),
      // remaining calls succeed.
      const sources = [sourceWithContainer()];
      let callIndex = 0;
      const calls: SpawnCall[] = [];
      const spawn: MockSpawn = {
        room: {
          name: "W1N1",
          energyCapacityAvailable: 600,
          find: (constant: number): any[] => (constant === (global as any).FIND_SOURCES ? sources : [])
        },
        spawning: null,
        calls,
        spawnCreep: (body: BodyPartConstant[], name: string, opts: SpawnOptions): number => {
          calls.push({ body, name, memory: opts.memory });
          const result = callIndex === 0 ? -6 : 0;
          callIndex++;
          return result;
        }
      };
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.time = 800;
      (global as any).Game.creeps = {};

      runSpawner();

      // First attempt: stationaryHarvester fails; falls through to hauler (succeeds).
      assert.equal(spawn.calls.length, 2);
      assert.equal(spawn.calls[0].memory?.role, "stationaryHarvester");
      assert.equal(spawn.calls[1].memory?.role, "hauler");
      assert.notEqual(spawn.calls[0].name, spawn.calls[1].name);
    });
  });

  describe("runSpawner — source-aware mining saturation", () => {
    it("pins newly spawned harvesters to a source id (inactive queue)", () => {
      const spawn = createMockSpawn({ sources: [bareSource("src-A")] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "harvester");
      assert.equal(spawn.calls[0].memory?.sourceId, "src-A");
    });

    it("distributes harvesters across sources, preferring the least saturated", () => {
      const srcA = bareSource("src-A");
      const srcB = bareSource("src-B");
      const spawn = createMockSpawn({ sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: spawn };
      // 2 WORK already pinned to srcA → spawner should pick srcB.
      (global as any).Game.creeps = {
        H1: harvesterCreep("W1N1", "src-A"),
        H2: harvesterCreep("W1N1", "src-A")
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.sourceId, "src-B");
    });

    it("does not spawn more harvesters once every source is at WORK saturation", () => {
      const srcA = bareSource("src-A");
      const spawn = createMockSpawn({ sources: [srcA] });
      (global as any).Game.spawns = { Spawn1: spawn };
      // 5 WORK already assigned to srcA → harvester target = 0; only builder/upgrader remain.
      (global as any).Game.creeps = {
        H1: harvesterCreep("W1N1", "src-A"),
        H2: harvesterCreep("W1N1", "src-A"),
        H3: harvesterCreep("W1N1", "src-A"),
        H4: harvesterCreep("W1N1", "src-A"),
        H5: harvesterCreep("W1N1", "src-A")
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "builder");
    });

    it("auto-refills harvesters when one source loses a creep", () => {
      const srcA = bareSource("src-A");
      const srcB = bareSource("src-B");
      const spawn = createMockSpawn({ sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: spawn };
      // srcA saturated (5 WORK), srcB has only 4 WORK → next harvester should go to srcB.
      (global as any).Game.creeps = {
        A1: harvesterCreep("W1N1", "src-A"),
        A2: harvesterCreep("W1N1", "src-A"),
        A3: harvesterCreep("W1N1", "src-A"),
        A4: harvesterCreep("W1N1", "src-A"),
        A5: harvesterCreep("W1N1", "src-A"),
        B1: harvesterCreep("W1N1", "src-B"),
        B2: harvesterCreep("W1N1", "src-B"),
        B3: harvesterCreep("W1N1", "src-B"),
        B4: harvesterCreep("W1N1", "src-B")
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "harvester");
      assert.equal(spawn.calls[0].memory?.sourceId, "src-B");
    });

    it("pins stationaryHarvester to a container-covered source", () => {
      const covered = makeSource([{ structureType: "container" }], "src-covered");
      const spawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [covered] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "stationaryHarvester");
      assert.equal(spawn.calls[0].memory?.sourceId, "src-covered");
    });

    it("spawns one stationaryHarvester per container-covered source (active queue)", () => {
      const srcA = makeSource([{ structureType: "container" }], "src-A");
      const srcB = makeSource([{ structureType: "container" }], "src-B");
      const spawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: spawn };
      // Only srcA covered → next spawn should pick srcB.
      (global as any).Game.creeps = {
        SH1: {
          memory: { role: "stationaryHarvester", room: "W1N1", sourceId: "src-A" },
          body: [
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "carry" },
            { type: "move" }
          ]
        }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "stationaryHarvester");
      assert.equal(spawn.calls[0].memory?.sourceId, "src-B");
    });

    it("targets haulers equal to container-covered sources + 1", () => {
      const srcA = makeSource([{ structureType: "container" }], "src-A");
      const srcB = makeSource([{ structureType: "container" }], "src-B");
      const spawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: spawn };
      // Both stationary harvesters pinned → stationary target met (2). Two haulers exist;
      // target = 2 + 1 = 3 → should spawn another hauler.
      (global as any).Game.creeps = {
        SHA: {
          memory: { role: "stationaryHarvester", room: "W1N1", sourceId: "src-A" },
          body: [
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "carry" },
            { type: "move" }
          ]
        },
        SHB: {
          memory: { role: "stationaryHarvester", room: "W1N1", sourceId: "src-B" },
          body: [
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "carry" },
            { type: "move" }
          ]
        },
        H1: { memory: { role: "hauler", room: "W1N1" } },
        H2: { memory: { role: "hauler", room: "W1N1" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "hauler");
    });

    it("still spawns self-harvest harvesters for uncovered sources in active queue", () => {
      const covered = makeSource([{ structureType: "container" }], "src-covered");
      const uncovered = bareSource("src-uncovered");
      const spawn = createMockSpawn({
        energyCapacityAvailable: 600,
        sources: [covered, uncovered]
      });
      (global as any).Game.spawns = { Spawn1: spawn };
      // Stationary covered, hauler target (1+1=2) met → harvester should target uncovered.
      (global as any).Game.creeps = {
        SH: {
          memory: { role: "stationaryHarvester", room: "W1N1", sourceId: "src-covered" },
          body: [
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "work" },
            { type: "carry" },
            { type: "move" }
          ]
        },
        H1: { memory: { role: "hauler", room: "W1N1" } },
        H2: { memory: { role: "hauler", room: "W1N1" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "harvester");
      assert.equal(spawn.calls[0].memory?.sourceId, "src-uncovered");
    });
  });

  describe("runSpawner — per-room counting", () => {
    it("attributes creeps to their memory.room, not current position", () => {
      const spawn = createMockSpawn({ roomName: "W1N1" });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        // Physically elsewhere but home is W1N1 — should count.
        Harv1: harvesterCreep("W1N1"),
        Harv2: harvesterCreep("W1N1"),
        Harv3: harvesterCreep("W1N1"),
        Harv4: harvesterCreep("W1N1"),
        Harv5: harvesterCreep("W1N1"),
        Builder1: { memory: { role: "builder", room: "W1N1" } },
        Upgrader1: { memory: { role: "upgrader", room: "W1N1" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 0);
    });

    it("skips creeps with undefined memory.room", () => {
      const spawn = createMockSpawn();
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.time = 999;
      (global as any).Game.creeps = {
        Orphan1: { memory: { role: "harvester" } },
        Orphan2: { memory: { role: "harvester" } }
      };

      runSpawner();

      // Orphans not counted; harvester threshold still unmet -> spawns harvester.
      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "harvester");
    });

    it("does not attribute creeps from another room", () => {
      const spawn = createMockSpawn({ roomName: "W1N1" });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        OtherRoomHarv1: { memory: { role: "harvester", room: "W2N2" } },
        OtherRoomHarv2: { memory: { role: "harvester", room: "W2N2" } }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "harvester");
      assert.equal(spawn.calls[0].memory?.room, "W1N1");
    });
  });

  describe("runSpawner — multi-spawn behavior", () => {
    it("skips busy spawns", () => {
      const busySpawn = createMockSpawn({ spawning: {} });
      const idleSpawn = createMockSpawn();
      (global as any).Game.spawns = { Busy: busySpawn, Idle: idleSpawn };
      (global as any).Game.time = 999;

      runSpawner();

      assert.equal(busySpawn.calls.length, 0);
      assert.equal(idleSpawn.calls.length, 1);
      assert.equal(idleSpawn.calls[0].name, "Harvester_999");
    });

    it("continues to later spawns after a failed spawn attempt and uses unique names on retries", () => {
      const firstSpawn = createMockSpawn({ returnCode: -3 });
      const secondSpawn = createMockSpawn({ returnCode: 0 });
      (global as any).Game.spawns = { Spawn1: firstSpawn, Spawn2: secondSpawn };
      (global as any).Game.time = 4242;

      assert.doesNotThrow(() => runSpawner());
      assert.equal(firstSpawn.calls.length, 1);
      assert.equal(secondSpawn.calls.length, 1);
      assert.notEqual(firstSpawn.calls[0].name, secondSpawn.calls[0].name);
    });

    it("stops after the first successful spawn attempt", () => {
      const firstSpawn = createMockSpawn({ returnCode: 0 });
      const secondSpawn = createMockSpawn({ returnCode: 0 });
      (global as any).Game.spawns = { Spawn1: firstSpawn, Spawn2: secondSpawn };

      assert.doesNotThrow(() => runSpawner());
      assert.equal(firstSpawn.calls.length, 1);
      assert.equal(secondSpawn.calls.length, 0);
    });

    it("does nothing when there are no spawns", () => {
      (global as any).Game.spawns = {};

      assert.doesNotThrow(() => runSpawner());
    });
  });
});
