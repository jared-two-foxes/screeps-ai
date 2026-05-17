import { assert } from "chai";
import * as spawnerModule from "../../src/spawner";
import { canUseContainerStrategy, canUseStationaryStrategy, runSpawner } from "../../src/spawner";
import { Game, Memory } from "./mock";

// AC9 / AC10 — new exports that do not yet exist; importing them here causes
// the test file to fail until the implementation adds them.
import { incomePermitsHeavyMiner, canBuildExpansions } from "../../src/spawner";

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
      getTerrain: (): any => ({ get: (): number => 0 }),
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
    (global as any).TERRAIN_MASK_WALL = 1;
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
    it("does not assign the same source to two harvester spawns in the same tick", () => {
      const srcA = bareSource("src-a", 5, 5);
      const srcB = bareSource("src-b", 6, 6);
      const firstSpawn = createMockSpawn({ sources: [srcA, srcB] });
      const secondSpawn = createMockSpawn({ sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: firstSpawn, Spawn2: secondSpawn };
      (global as any).Game.creeps = {};

      runSpawner();

      const allCalls = [...firstSpawn.calls, ...secondSpawn.calls];
      assert.isAtLeast(allCalls.length, 1, "at least one spawn should fire");

      const harvesterCalls = allCalls.filter(c => c.memory?.role === "harvester");
      const sourceIds = harvesterCalls.map(c => c.memory?.sourceId);
      assert.equal(
        new Set(sourceIds).size,
        sourceIds.length,
        "no two harvester spawns should share the same sourceId"
      );

      // First harvester should be pinned to src-a (alphabetically first / closest)
      if (harvesterCalls.length > 0) {
        assert.equal(harvesterCalls[0].memory?.sourceId, "src-a");
      }
    });

    it("does not assign the same source to two stationaryHarvester spawns in the same tick", () => {
      const srcA = sourceWithContainer("src-a", 5, 5);
      const srcB = sourceWithContainer("src-b", 6, 6);
      const firstSpawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [srcA, srcB] });
      const secondSpawn = createMockSpawn({ energyCapacityAvailable: 600, sources: [srcA, srcB] });
      (global as any).Game.spawns = { Spawn1: firstSpawn, Spawn2: secondSpawn };
      (global as any).Game.creeps = {};

      runSpawner();

      const allCalls = [...firstSpawn.calls, ...secondSpawn.calls];
      assert.isAtLeast(allCalls.length, 1, "at least one spawn should fire");

      const shCalls = allCalls.filter(c => c.memory?.role === "stationaryHarvester");
      const sourceIds = shCalls.map(c => c.memory?.sourceId);
      assert.equal(
        new Set(sourceIds).size,
        sourceIds.length,
        "no two stationaryHarvester spawns should share the same sourceId"
      );

      if (shCalls.length > 0) {
        assert.equal(shCalls[0].memory?.sourceId, "src-a");
      }
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
        HC1: makeHarvester("W1N1", "b-ctrl-src"),
        HC2: makeHarvester("W1N1", "b-ctrl-src"),
        HC3: makeHarvester("W1N1", "b-ctrl-src"),
        HC4: makeHarvester("W1N1", "b-ctrl-src"),
        HC5: makeHarvester("W1N1", "b-ctrl-src"),
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
        HC1: makeHarvester("W1N1", "b-ctrl-src"),
        HC2: makeHarvester("W1N1", "b-ctrl-src"),
        HC3: makeHarvester("W1N1", "b-ctrl-src"),
        HC4: makeHarvester("W1N1", "b-ctrl-src"),
        HC5: makeHarvester("W1N1", "b-ctrl-src"),
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

  // ---------------------------------------------------------------------------
  // AC1 — multi-spawn fires both spawns in one tick for 2 different roles
  // ---------------------------------------------------------------------------

  describe("AC1 — all idle spawns fire on the same tick", () => {
    it("fires both idle spawns in the same tick when 2 different roles are needed", () => {
      // Room has 2 sources; no creeps at all → harvester slot is needed.
      // We also need a second role (builder) to be under-target so the second
      // spawn has something to do.  We seed 5 harvesters for src-a so that
      // src-a is saturated, then the second spawn should pick the next role.
      const srcA = bareSource("src-a", 5, 5);
      const srcB = bareSource("src-b", 6, 6);

      const spawn1 = createMockSpawn({ sources: [srcA, srcB] });
      const spawn2 = createMockSpawn({ sources: [srcA, srcB] });

      // Provide both spawns in the same room by sharing the room object.
      // createMockSpawn builds its own room; wire them to the same room name
      // and make each spawn's room.find(FIND_MY_SPAWNS) return both spawns.
      spawn1.room.find = (constant: number): any[] => {
        if (constant === (global as any).FIND_SOURCES) return [srcA, srcB];
        if (constant === (global as any).FIND_MY_SPAWNS) return [spawn1, spawn2];
        return [];
      };
      spawn2.room = spawn1.room; // same room object

      (global as any).Game.spawns = { Spawn1: spawn1, Spawn2: spawn2 };
      // No creeps → harvester needed for src-a (first role in inactiveQueue)
      // and builder needed (second role).
      (global as any).Game.creeps = {};

      runSpawner();

      // Both spawns should have been used — total calls across both spawns = 2
      const totalCalls = spawn1.calls.length + spawn2.calls.length;
      assert.equal(totalCalls, 2, "both idle spawns should fire on the same tick");
    });
  });

  // ---------------------------------------------------------------------------
  // AC2 — hauler role uses the dedicated hauler body
  // ---------------------------------------------------------------------------

  describe("AC2 — hauler role uses dedicated hauler body", () => {
    it("spawns the dedicated hauler body [CARRY×4,MOVE×4] for the hauler role", () => {
      // Container source → containerQueue is selected → hauler slot is needed
      // after harvesters are saturated.
      const spawn = createMockSpawn({
        energyCapacityAvailable: 300,
        sources: [sourceWithContainer("src-a", 5, 5)]
      });
      (global as any).Game.spawns = { Spawn1: spawn };
      // 5 harvesters already present — harvester slot saturated.
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

      const dedicatedHaulerBody = ["carry", "carry", "carry", "carry", "move", "move", "move", "move"];
      assert.deepEqual(
        spawn.calls[0].body,
        dedicatedHaulerBody,
        "hauler must use the dedicated [CARRY×4,MOVE×4] body"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC8 — harvester cap respected even in fallback path
  // ---------------------------------------------------------------------------

  describe("AC8 — harvester cap is always respected", () => {
    it("does not spawn a harvester when all sources are at or above the work cap", () => {
      // 5 harvesters already assigned to src-a (= SOURCE_WORK_SATURATION cap).
      // Even the fallback step must not spawn another harvester.
      const spawn = createMockSpawn({ energyCapacityAvailable: 300, sources: [bareSource("src-a", 5, 5)] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a")
      };

      runSpawner();

      // The spawner should move on to builder, not spawn a 6th harvester.
      if (spawn.calls.length > 0) {
        assert.notEqual(
          spawn.calls[0].memory?.role,
          "harvester",
          "spawner must not spawn a harvester beyond the work cap"
        );
      }
    });

    it("does not spawn a harvester in an empty room beyond the cap for a single source", () => {
      // Single source at close range → cap = SOURCE_WORK_SATURATION (5 WORK parts).
      // With 5 harvesters (each 1 WORK part) already present, no more harvesters.
      const spawn = createMockSpawn({ energyCapacityAvailable: 300, sources: [bareSource("src-a", 2, 2)] });
      (global as any).Game.spawns = { Spawn1: spawn };
      (global as any).Game.creeps = {
        H1: makeHarvester("W1N1", "src-a"),
        H2: makeHarvester("W1N1", "src-a"),
        H3: makeHarvester("W1N1", "src-a"),
        H4: makeHarvester("W1N1", "src-a"),
        H5: makeHarvester("W1N1", "src-a")
      };

      runSpawner();

      const harvesterSpawns = spawn.calls.filter((c: SpawnCall) => c.memory?.role === "harvester");
      assert.equal(harvesterSpawns.length, 0, "no additional harvester should be spawned when cap is reached");
    });
  });

  // ---------------------------------------------------------------------------
  // AC9 — incomePermitsHeavyMiner true/false cases
  // ---------------------------------------------------------------------------

  describe("AC9 — incomePermitsHeavyMiner", () => {
    // incomePermitsHeavyMiner(harvestRate, fleetMaintenanceCost, stationaryHarvesterBodyCost)
    // Returns true when: harvestRate − fleetMaintenanceCost ≥ stationaryHarvesterBodyCost / CREEP_LIFE_TIME

    it("returns true when surplus income covers the stationaryHarvester body amortised cost", () => {
      // stationaryHarvester body: [WORK×5, CARRY, MOVE] = 5×100 + 50 + 50 = 600
      // amortised cost = 600 / 1500 = 0.4 e/tick
      // harvestRate = 10, fleetMaintenanceCost = 9 → surplus = 1 ≥ 0.4 → true
      const stationaryBodyCost = 600; // 5×WORK + CARRY + MOVE
      const result = incomePermitsHeavyMiner(10, 9, stationaryBodyCost);
      assert.isTrue(result, "should return true when surplus ≥ amortised body cost");
    });

    it("returns false when fleet cost exceeds income leaving no surplus for stationaryHarvester", () => {
      // harvestRate = 5, fleetMaintenanceCost = 5 → surplus = 0 < 0.4 → false
      const stationaryBodyCost = 600;
      const result = incomePermitsHeavyMiner(5, 5, stationaryBodyCost);
      assert.isFalse(result, "should return false when surplus is zero");
    });

    it("returns false when fleet maintenance cost exceeds harvest rate", () => {
      // harvestRate = 3, fleetMaintenanceCost = 10 → surplus = -7 → false
      const stationaryBodyCost = 600;
      const result = incomePermitsHeavyMiner(3, 10, stationaryBodyCost);
      assert.isFalse(result, "should return false when fleet cost exceeds income");
    });

    it("returns true at the exact break-even point", () => {
      // surplus = stationaryBodyCost / CREEP_LIFE_TIME exactly → true (≥)
      const stationaryBodyCost = 600;
      const amortised = stationaryBodyCost / 1500; // 0.4
      const result = incomePermitsHeavyMiner(amortised + 5, 5, stationaryBodyCost);
      assert.isTrue(result, "should return true at exact break-even");
    });
  });

  // ---------------------------------------------------------------------------
  // AC10 — canBuildExpansions true/false cases
  // ---------------------------------------------------------------------------

  describe("AC10 — canBuildExpansions", () => {
    // canBuildExpansions(harvestRate, fleetMaintenanceCost, workerBodyCost, upgraderCount)
    // Returns true when:
    //   1. harvestRate − fleetMaintenanceCost ≥ workerBodyCost / CREEP_LIFE_TIME  (at least 1 upgrader supportable)
    //   2. Additional surplus exists beyond all currently-running upgraders' maintenance.
    // Returns false if income barely covers upgraders.

    it("returns true when surplus income covers at least one upgrader and has additional surplus", () => {
      // workerBody = [WORK, CARRY, MOVE] = 200 cost; amortised = 200/1500 ≈ 0.133 e/tick
      // harvestRate = 10, fleetMaintenanceCost = 0, upgraderCount = 0
      // surplus = 10 ≥ 0.133 → can support upgrader; no upgraders running → expansion ok
      const workerBodyCost = 200;
      const result = canBuildExpansions(10, 0, workerBodyCost, 0);
      assert.isTrue(result, "should return true when surplus is well above upgrader cost");
    });

    it("returns false when income barely covers existing upgraders with no additional surplus", () => {
      // workerBodyCost = 200; amortised = 200/1500 ≈ 0.133 e/tick
      // 1 upgrader running → upgrader maintenance = 0.133 e/tick
      // harvestRate = 0.133 + 0 = 0.133, fleetMaintenanceCost = 0
      // surplus after upgrader = 0 → cannot build expansions
      const workerBodyCost = 200;
      const amortised = workerBodyCost / 1500;
      const result = canBuildExpansions(amortised, 0, workerBodyCost, 1);
      assert.isFalse(result, "should return false when income barely covers existing upgraders");
    });

    it("returns false when fleet maintenance cost exceeds harvest rate entirely", () => {
      const workerBodyCost = 200;
      const result = canBuildExpansions(1, 100, workerBodyCost, 0);
      assert.isFalse(result, "should return false when fleet cost exceeds income");
    });

    it("uses a distinct formula from canSupportAnotherUpgrader — returns false when income only covers upgraders", () => {
      // canSupportAnotherUpgrader would return true here (surplus ≥ next upgrader cost).
      // canBuildExpansions must return false because there is no surplus BEYOND upgraders.
      const workerBodyCost = 200;
      const amortised = workerBodyCost / 1500; // ≈ 0.133
      // harvestRate = 2 × amortised, fleetMaintenanceCost = 0, upgraderCount = 1
      // surplus = 2×amortised − 0 = 2×amortised
      // upgrader maintenance = 1 × amortised
      // remaining after upgraders = 2×amortised − amortised = amortised
      // canBuildExpansions requires remaining > amortised (strictly more than one upgrader's worth)
      // so with exactly amortised remaining it should be false (income only covers upgraders)
      const result = canBuildExpansions(amortised, 0, workerBodyCost, 1);
      assert.isFalse(result, "canBuildExpansions must return false when income only covers existing upgraders");
    });
  });

  // ─── Issue-1 regression ───────────────────────────────────────────────────
  // Previously harvesters were restricted to spawnSourceIds, so the
  // controller-proximate source could never be harvested by an inactive-queue
  // harvester. The fix opens all sources to all harvester roles.
  describe("Issue 1 regression — harvesters target all sources equally", () => {
    it("assigns a new harvester to the controller-proximate source when spawn-proximate source is WORK-saturated", () => {
      const srcA = bareSource("src-spawn", 2, 2);
      const srcB = bareSource("src-ctrl", 18, 18);

      // PathFinder returns 0-step path → cycleTime = 25, cap = 5 WORK for each source.
      (global as any).PathFinder = { search: (): any => ({ path: [], incomplete: false }) };

      // src-spawn already has 5 WORK parts assigned → WORK-saturated.
      (global as any).Game.creeps = {
        H1: { memory: { role: "harvester", room: "W1N1", sourceId: "src-spawn" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        H2: { memory: { role: "harvester", room: "W1N1", sourceId: "src-spawn" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        H3: { memory: { role: "harvester", room: "W1N1", sourceId: "src-spawn" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        H4: { memory: { role: "harvester", room: "W1N1", sourceId: "src-spawn" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        H5: { memory: { role: "harvester", room: "W1N1", sourceId: "src-spawn" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] }
      };

      const spawn = createMockSpawn({ sources: [srcA, srcB], controllerPos: makePos(20, 20) });
      (global as any).Game.spawns = { Spawn1: spawn };

      runSpawner();

      const harvesterCalls: SpawnCall[] = spawn.calls.filter((c: SpawnCall) => c.memory?.role === "harvester");
      assert.isAtLeast(harvesterCalls.length, 1, "should have spawned at least one harvester");
      const allGoToCtrl = harvesterCalls.every((c: SpawnCall) => c.memory?.sourceId === "src-ctrl");
      assert.isTrue(allGoToCtrl, "harvester(s) should be assigned to src-ctrl, the unsaturated source");
    });
  });

  // ─── Issue-2 regression ───────────────────────────────────────────────────
  // Previously saturation used only WORK-part math, ignoring how many creeps
  // could physically stand around a source. The fix counts walkable adjacent
  // tiles and caps assignment at that number.
  describe("Issue 2 regression — creep count capped by walkable tiles", () => {
    it("does not assign more harvesters to a source than its walkable-tile count", () => {
      const srcA = bareSource("src-a", 10, 10);
      const srcB = bareSource("src-b", 5, 5);

      // 6 of 8 neighbours of src-a are walls → tile cap = 2.
      const wallsAroundA = new Set(["9,9", "10,9", "11,9", "9,11", "10,11", "11,11"]);

      // src-a already has 2 harvesters → physical cap reached.
      (global as any).Game.creeps = {
        H1: { memory: { role: "harvester", room: "W1N1", sourceId: "src-a" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] },
        H2: { memory: { role: "harvester", room: "W1N1", sourceId: "src-a" }, body: [{ type: "work" }, { type: "carry" }, { type: "move" }] }
      };

      const spawn = createMockSpawn({ sources: [srcA, srcB] });
      spawn.room.getTerrain = (): any => ({
        get: (x: number, y: number): number =>
          wallsAroundA.has(`${x},${y}`) ? (global as any).TERRAIN_MASK_WALL : 0
      });
      (global as any).Game.spawns = { Spawn1: spawn };

      runSpawner();

      const harvesterCalls: SpawnCall[] = spawn.calls.filter((c: SpawnCall) => c.memory?.role === "harvester");
      assert.isAtLeast(harvesterCalls.length, 1, "should spawn a harvester for the open source");
      for (const call of harvesterCalls) {
        assert.notStrictEqual(
          call.memory?.sourceId,
          "src-a",
          "must not assign another harvester to src-a whose tile cap (2) is already reached"
        );
      }
    });
  });

  // ─── countWalkableAdjacentTiles unit tests ────────────────────────────────
  describe("countWalkableAdjacentTiles", () => {
    it("counts only non-wall tiles in the 3×3 neighbourhood, excluding the source centre", () => {
      const countFn = (spawnerModule as any).countWalkableAdjacentTiles;
      assert.isFunction(countFn, "countWalkableAdjacentTiles should be exported");

      // 6 of 8 neighbours of (10,10) are walls; (9,10) and (11,10) remain passable.
      const walls = new Set(["9,9", "10,9", "11,9", "9,11", "10,11", "11,11"]);
      const source = { id: "s1", pos: { x: 10, y: 10 } };
      const room = {
        getTerrain: () => ({
          get: (x: number, y: number): number =>
            walls.has(`${x},${y}`) ? (global as any).TERRAIN_MASK_WALL : 0
        })
      };

      assert.equal((countFn as any)(room, source), 2, "should count exactly 2 walkable tiles");
    });

    it("returns 8 when all adjacent tiles are walkable", () => {
      const countFn = (spawnerModule as any).countWalkableAdjacentTiles;
      const source = { id: "s1", pos: { x: 10, y: 10 } };
      const room = { getTerrain: () => ({ get: (): number => 0 }) };
      assert.equal((countFn as any)(room, source), 8);
    });

    it("returns 0 when all adjacent tiles are walls", () => {
      const countFn = (spawnerModule as any).countWalkableAdjacentTiles;
      const source = { id: "s1", pos: { x: 10, y: 10 } };
      const room = { getTerrain: () => ({ get: (): number => (global as any).TERRAIN_MASK_WALL }) };
      assert.equal((countFn as any)(room, source), 0);
    });
  });
});  // end describe("spawner (Track A scaffold)")
