import { assert } from "chai";
import * as spawnerModule from "../../src/spawner";
import { canUseContainerStrategy, canUseStationaryStrategy, runSpawner } from "../../src/spawner";
import { Game, Memory } from "./mock";

interface SpawnCall {
  body: BodyPartConstant[];
  name: string;
  memory: CreepMemory | undefined;
}

interface MockSpawnOptions {
  roomName?: string;
  spawning?: object | null;
  returnCode?: number;
  energyCapacityAvailable?: number;
  sources?: any[];
  controllerPos?: any;
  mySpawns?: any[];
}

const makePos = (x: number, y: number, roomName: string = "W1N1", adjacent: any[] = []): any => ({
  x,
  y,
  roomName,
  findInRange: (constant: number): any[] => {
    if (constant === (global as any).FIND_STRUCTURES) return adjacent;
    return [];
  },
  getRangeTo: (target: { x: number; y: number }): number => Math.max(Math.abs(x - target.x), Math.abs(y - target.y))
});

const bareSource = (id: string, x: number, y: number): any => ({
  id,
  pos: makePos(x, y)
});

const sourceWithContainer = (id: string, x: number, y: number): any => ({
  id,
  pos: makePos(x, y, "W1N1", [{ structureType: "container" }])
});

const makeHarvester = (room: string, sourceId: string): any => ({
  memory: { role: "harvester", room, sourceId },
  body: [{ type: "work" }, { type: "carry" }, { type: "move" }]
});

const makeStationaryHarvester = (room: string, sourceId: string): any => ({
  memory: { role: "stationaryHarvester", room, sourceId },
  body: [{ type: "work" }, { type: "work" }, { type: "work" }, { type: "work" }, { type: "work" }, { type: "carry" }, { type: "move" }]
});

const createMockSpawn = (options: MockSpawnOptions = {}): any => {
  const calls: SpawnCall[] = [];
  const roomName = options.roomName ?? "W1N1";
  const sources = options.sources ?? [bareSource("src-1", 5, 5)];
  const spawnPos = makePos(0, 0, roomName);
  const controllerPos = options.controllerPos ?? makePos(20, 20, roomName);
  const spawn: any = {
    pos: spawnPos,
    room: {
      name: roomName,
      energyCapacityAvailable: options.energyCapacityAvailable ?? 300,
      energyAvailable: options.energyCapacityAvailable ?? 300,
      controller: { pos: controllerPos },
      find: (constant: number): any[] => {
        if (constant === (global as any).FIND_SOURCES) return sources;
        if (constant === (global as any).FIND_MY_SPAWNS) return options.mySpawns ?? [spawn];
        return [];
      }
    },
    spawning: options.spawning ?? null,
    calls,
    spawnCreep: (body: BodyPartConstant[], name: string, opts: SpawnOptions): number => {
      calls.push({ body, name, memory: opts.memory });
      return options.returnCode ?? (global as any).OK;
    }
  };
  return spawn;
};

describe("spawner (Track A scaffold)", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);

    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_STRUCTURES = 2;
    (global as any).FIND_MY_SPAWNS = 3;
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).OK = 0;
    (global as any).ERR_NOT_ENOUGH_ENERGY = -6;
    (global as any).WORK = "work";
    (global as any).CARRY = "carry";
    (global as any).MOVE = "move";
    (global as any).BODYPART_COST = { work: 100, carry: 50, move: 50 };
    (global as any).CREEP_LIFE_TIME = 1500;
    (global as any).Game.time = 1000;
    (global as any).PathFinder = {
      search: () => ({ path: [], incomplete: false })
    };

    const clearDistanceCache = (spawnerModule as any).clearDistanceCache;
    if (typeof clearDistanceCache === "function") clearDistanceCache();
  });

  describe("canUseStationaryStrategy", () => {
    it("returns true only when capacity is high enough and at least one source has an adjacent container", () => {
      const covered = sourceWithContainer("src-covered", 5, 5);
      const room = {
        energyCapacityAvailable: 600,
        find: (constant: number): any[] => (constant === (global as any).FIND_SOURCES ? [covered] : [])
      };
      assert.isTrue(canUseStationaryStrategy(room as any));
    });
  });

  describe("canUseContainerStrategy", () => {
    it("returns false when no source has an adjacent container", () => {
      const room = {
        find: (constant: number): any[] =>
          constant === (global as any).FIND_SOURCES ? [bareSource("src-a", 5, 5)] : []
      };
      assert.isFalse(canUseContainerStrategy(room as any));
    });

    it("returns true when at least one source has an adjacent container", () => {
      const room = {
        find: (constant: number): any[] =>
          constant === (global as any).FIND_SOURCES ? [sourceWithContainer("src-a", 5, 5)] : []
      };
      assert.isTrue(canUseContainerStrategy(room as any));
    });

    it("returns true even when energy capacity is below 600", () => {
      const room = {
        energyCapacityAvailable: 300,
        find: (constant: number): any[] =>
          constant === (global as any).FIND_SOURCES ? [sourceWithContainer("src-a", 5, 5)] : []
      };
      assert.isTrue(canUseContainerStrategy(room as any));
    });
  });

  describe("distance cache + classification seams", () => {
    it("exports clearDistanceCache test seam", () => {
      assert.isFunction((spawnerModule as any).clearDistanceCache);
    });

    it("exports upgrader gating helpers for direct formula tests", () => {
      assert.isFunction((spawnerModule as any).areSpawnSourcesSaturated);
      assert.isFunction((spawnerModule as any).canSupportAnotherUpgrader);
    });

    it("reuses cached path distances across repeated classifications", () => {
      let pathSearches = 0;
      (global as any).PathFinder.search = () => {
        pathSearches++;
        return { path: [{}, {}, {}], incomplete: false };
      };

      const classifySources = (spawnerModule as any).classifySources;
      assert.isFunction(classifySources);

      const spawnPosA = makePos(0, 0);
      const ctrlPosA = makePos(15, 15);
      const first = [bareSource("src-a", 10, 10), bareSource("src-b", 12, 12)];
      const second = [bareSource("src-a", 10, 10), bareSource("src-b", 12, 12)];

      classifySources(first, spawnPosA, ctrlPosA);
      classifySources(second, makePos(0, 0), makePos(15, 15));

      // Expect only first pass to pathfind (2 sources × 2 anchors = 4 lookups total).
      assert.equal(pathSearches, 4);
    });

    it("uses Chebyshev fallback when PathFinder returns incomplete paths", () => {
      (global as any).PathFinder.search = () => ({ path: [], incomplete: true });
      const classifySources = (spawnerModule as any).classifySources;
      assert.isFunction(classifySources);

      const sourceNearSpawn = bareSource("src-near-spawn", 2, 2);
      const sourceNearController = bareSource("src-near-controller", 18, 18);

      const result = classifySources([sourceNearSpawn, sourceNearController], makePos(0, 0), makePos(20, 20));

      assert.deepEqual(result.spawnSourceIds, ["src-near-spawn"]);
      assert.deepEqual(result.controllerSourceIds, ["src-near-controller"]);
    });

    it("classifies 1 source as spawn-supply only", () => {
      const classifySources = (spawnerModule as any).classifySources;
      assert.isFunction(classifySources);

      const result = classifySources([bareSource("only", 6, 6)], makePos(0, 0), makePos(20, 20));
      assert.deepEqual(result.spawnSourceIds, ["only"]);
      assert.deepEqual(result.controllerSourceIds, []);
    });

    it("classifies exactly 2 sources by d_spawn - d_ctrl with deterministic tie-break", () => {
      const classifySources = (spawnerModule as any).classifySources;
      assert.isFunction(classifySources);

      const a = bareSource("a-source", 4, 4);
      const b = bareSource("b-source", 16, 16);

      const result = classifySources([b, a], makePos(0, 0), makePos(20, 20));

      assert.deepEqual(result.spawnSourceIds, ["a-source"]);
      assert.deepEqual(result.controllerSourceIds, ["b-source"]);
    });

    it("uses source id as deterministic tie-break for exactly 2 sources with equal score", () => {
      (global as any).PathFinder.search = () => ({ path: new Array(7).fill({}), incomplete: false });
      const classifySources = (spawnerModule as any).classifySources;
      assert.isFunction(classifySources);

      const a = bareSource("a-source", 10, 10);
      const b = bareSource("b-source", 11, 11);

      const result = classifySources([b, a], makePos(0, 0), makePos(20, 20));

      assert.deepEqual(result.spawnSourceIds, ["a-source"]);
      assert.deepEqual(result.controllerSourceIds, ["b-source"]);
    });

    it("classifies 3+ sources with exactly one controller-supply source", () => {
      // Use Chebyshev distances (incomplete=true) so s3 (closest to controller) wins.
      (global as any).PathFinder.search = () => ({ path: [], incomplete: true });
      const classifySources = (spawnerModule as any).classifySources;
      assert.isFunction(classifySources);

      const s1 = bareSource("s1", 2, 2);
      const s2 = bareSource("s2", 8, 8);
      const s3 = bareSource("s3", 19, 19);

      const result = classifySources([s1, s2, s3], makePos(0, 0), makePos(20, 20));

      assert.equal(result.controllerSourceIds.length, 1);
      assert.deepEqual(result.controllerSourceIds, ["s3"]);
      assert.sameMembers(result.spawnSourceIds, ["s1", "s2"]);
    });
  });

  describe("inactive queue behavior", () => {
    it("uses doubled worker body at the 400 capacity threshold", () => {
      const spawn = createMockSpawn({ energyCapacityAvailable: 400, sources: [bareSource("src-a", 5, 5)] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.deepEqual(spawn.calls[0].body, ["work", "carry", "move", "work", "carry", "move"]);
      assert.equal(spawn.calls[0].memory?.role, "harvester");
    });

    it("uses worker body for builder and upgrader at the 400 threshold", () => {
      const spawnBuilder = createMockSpawn({ energyCapacityAvailable: 400, sources: [bareSource("src-a", 5, 5)] });
      (global as any).Game.spawns = { Spawn1: spawnBuilder };
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a")
      };

      runSpawner();

      assert.equal(spawnBuilder.calls.length, 1);
      assert.equal(spawnBuilder.calls[0].memory?.role, "builder");
      assert.deepEqual(spawnBuilder.calls[0].body, ["work", "carry", "move", "work", "carry", "move"]);

      const spawnUpgrader = createMockSpawn({ energyCapacityAvailable: 400, sources: [bareSource("src-a", 5, 5)] });
      (global as any).Game.spawns = { Spawn1: spawnUpgrader };
      // At 400 capacity workerBody has 2 WORK parts → neededWorkCap = ceil(5*25/(25*2))*2 = 6.
      // Six single-WORK harvesters (6 × 1 = 6) meet that cap so areSpawnSourcesSaturated returns true.
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a"),
        H6: makeHarvester("W1N1", "src-a"),
        Builder1: { memory: { role: "builder", room: "W1N1" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] }
      };

      runSpawner();

      assert.equal(spawnUpgrader.calls.length, 1);
      assert.equal(spawnUpgrader.calls[0].memory?.role, "upgrader");
      assert.deepEqual(spawnUpgrader.calls[0].body, ["work", "carry", "move", "work", "carry", "move"]);
    });

    it("caps harvester count at SOURCE_WORK_SATURATION (5) regardless of source distance", () => {
      // Distance-formula raw target for a path-length-30 source would be 23, but the
      // hard cap of SOURCE_WORK_SATURATION (5) applies.  With 5 harvesters already
      // present the spawner should consider the source saturated and spawn a builder.
      const spawn = createMockSpawn({ energyCapacityAvailable: 300, sources: [bareSource("src-a", 30, 30)] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).PathFinder.search = () => ({ path: new Array(30).fill({}), incomplete: false });
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a")
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "builder");
    });
  });

  describe("containerQueue behavior", () => {
    it("selects containerQueue (spawns hauler) when container exists but capacity is below 600", () => {
      // inactiveQueue never spawns haulers; seeing a hauler spawn confirms containerQueue was used.
      const spawn = createMockSpawn({
        energyCapacityAvailable: 300,
        sources: [sourceWithContainer("src-a", 5, 5)]
      });
      (global as any).Game.spawns = { Spawn1: spawn };
      // 5 harvesters already present — harvester slot is saturated.
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a")
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "hauler");
    });

    it("uses activeQueue (spawns stationaryHarvester) when capacity >= 600 and container exists", () => {
      const spawn = createMockSpawn({
        energyCapacityAvailable: 600,
        sources: [sourceWithContainer("src-a", 5, 5)]
      });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "stationaryHarvester");
    });

    it("containerQueue harvester target uses SOURCE_WORK_SATURATION for container sources", () => {
      // Container source at range 30 — inactiveQueue raw target would be 23; containerQueue
      // should use SOURCE_WORK_SATURATION (5) since the harvester stays put.
      // With 5 harvesters already present the next slot should be hauler.
      const spawn = createMockSpawn({
        energyCapacityAvailable: 300,
        sources: [sourceWithContainer("src-a", 30, 30)]
      });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).PathFinder.search = () => ({ path: new Array(30).fill({}), incomplete: false });
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a")
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "hauler");
    });
  });

  describe("same-tick source accounting", () => {
    it("keeps one-spawn-per-call behavior for harvester spawns", () => {
      const srcA = bareSource("src-a", 5, 5);
      const srcB = bareSource("src-b", 6, 6);
      const firstSpawn = createMockSpawn({ sources: [srcA, srcB] });
      const secondSpawn = createMockSpawn({ sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: firstSpawn, Spawn2: secondSpawn };
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(firstSpawn.calls.length + secondSpawn.calls.length, 1);
      const call = [...firstSpawn.calls, ...secondSpawn.calls][0];
      assert.equal(call.memory?.role, "harvester");
      assert.equal(call.memory?.sourceId, "src-a");
    });

    it("keeps one-spawn-per-call behavior for stationaryHarvester spawns", () => {
      const srcA = sourceWithContainer("src-a", 5, 5);
      const srcB = sourceWithContainer("src-b", 6, 6);
      const firstSpawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [srcA, srcB] });
      const secondSpawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: firstSpawn, Spawn2: secondSpawn };
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(firstSpawn.calls.length + secondSpawn.calls.length, 1);
      const call = [...firstSpawn.calls, ...secondSpawn.calls][0];
      assert.equal(call.memory?.role, "stationaryHarvester");
      assert.equal(call.memory?.sourceId, "src-a");
    });
  });

  describe("upgrader sourceId pinning", () => {
    it("spawning an upgrader assigns it the controller-supply sourceId", () => {
      // With default PathFinder (distance=0), 2-source tie-breaks by ID:
      // "a-spawn-src" < "b-ctrl-src" → "a-spawn-src" = spawn-supply, "b-ctrl-src" = ctrl-supply
      const spawnSrc = bareSource("a-spawn-src", 4, 4);
      const ctrlSrc = bareSource("b-ctrl-src", 16, 16);
      const spawn = createMockSpawn({ sources: [spawnSrc, ctrlSrc], controllerPos: makePos(20, 20) });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "a-spawn-src"),
        H2: makeHarvester("W1N1", "a-spawn-src"),
        H3: makeHarvester("W1N1", "a-spawn-src"),
        H4: makeHarvester("W1N1", "a-spawn-src"),
        H5: makeHarvester("W1N1", "a-spawn-src"),
        Builder1: { memory: { role: "builder", room: "W1N1" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "upgrader");
      assert.equal(spawn.calls[0].memory?.sourceId, "b-ctrl-src");
    });

    it("second upgrader also targets the controller-supply sourceId (least-assigned pick)", () => {
      const spawnSrc = bareSource("a-spawn-src", 4, 4);
      const ctrlSrc = bareSource("b-ctrl-src", 16, 16);
      const spawn = createMockSpawn({ sources: [spawnSrc, ctrlSrc], controllerPos: makePos(20, 20) });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "a-spawn-src"),
        H2: makeHarvester("W1N1", "a-spawn-src"),
        H3: makeHarvester("W1N1", "a-spawn-src"),
        H4: makeHarvester("W1N1", "a-spawn-src"),
        H5: makeHarvester("W1N1", "a-spawn-src"),
        Builder1: { memory: { role: "builder", room: "W1N1" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        Upgrader1: { memory: { role: "upgrader", room: "W1N1", sourceId: "b-ctrl-src" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "upgrader");
      assert.equal(spawn.calls[0].memory?.sourceId, "b-ctrl-src");
    });
  });

  describe("upgrader growth gate", () => {
    it("canSupportAnotherUpgrader true case grows upgrader count once spawn-sources are saturated", () => {
      const spawn = createMockSpawn({ sources: [bareSource("src-a", 5, 5)] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a"),
        Builder1: { memory: { role: "builder", room: "W1N1" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        Upgrader1: { memory: { role: "upgrader", room: "W1N1" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] }
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "upgrader");
    });

    it("canSupportAnotherUpgrader false case does not grow upgrader count", () => {
      const spawn = createMockSpawn({ sources: [bareSource("src-a", 5, 5)] });
      (global as any).Game.spawns = { Spawn1: spawn };

      const expensiveBody = new Array(50).fill(0).map(() => ({ type: "work" }));
      const costlyFleet: Record<string, any> = {};
      for (let i = 0; i < 40; i++) {
        costlyFleet[`Dummy_${i}`] = { memory: { role: "hauler", room: "W1N1" }, body: expensiveBody };
      }

      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a"),
        Builder1: { memory: { role: "builder", room: "W1N1" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        Upgrader1: { memory: { role: "upgrader", room: "W1N1" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        ...costlyFleet
      };

      runSpawner();

      assert.equal(spawn.calls.length, 0);
    });
  });

  describe("active queue filtering", () => {
    it("keeps stationaryHarvester and hauler bodies specialized even when worker body doubles", () => {
      const covered = sourceWithContainer("covered", 4, 4);
      const spawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [covered] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {};

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "stationaryHarvester");
      assert.deepEqual(spawn.calls[0].body, ["work", "work", "work", "work", "work", "carry", "move"]);
    });

    it("spawns active-queue harvesters only for uncovered spawn-supply sources", () => {
      const covered = sourceWithContainer("covered", 4, 4);
      const uncoveredControllerSupply = bareSource("ctrl-uncovered", 18, 18);
      const uncoveredSpawnSupply = bareSource("spawn-uncovered", 8, 8);

      const spawn = createMockSpawn({
        energyCapacityAvailable: 600,
        sources: [covered, uncoveredControllerSupply, uncoveredSpawnSupply],
        controllerPos: makePos(20, 20)
      });

      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        SH1: makeStationaryHarvester("W1N1", "covered"),
        Hauler1: { memory: { role: "hauler", room: "W1N1" }, body: [{ type: "carry" }, { type: "move" }] },
        Hauler2: { memory: { role: "hauler", room: "W1N1" }, body: [{ type: "carry" }, { type: "move" }] }
      };

      // Use Chebyshev fallback so distances reflect actual positions:
      //   ctrl-uncovered (18,18) is 2 tiles from controller (20,20) → controller-supply
      //   covered (4,4) and spawn-uncovered (8,8) are 16 and 12 tiles away → spawn-supply
      (global as any).PathFinder = {
        search: (): { path: any[]; incomplete: boolean } => ({ path: [], incomplete: true })
      };

      runSpawner();

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].memory?.role, "harvester");
      assert.equal(spawn.calls[0].memory?.sourceId, "spawn-uncovered");
    });
  });
});
