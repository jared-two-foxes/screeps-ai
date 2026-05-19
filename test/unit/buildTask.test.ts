import { assert } from "chai";
import { computeExtensionPlan, runBuildTask } from "../../src/tasks/build";
import { Game, Memory } from "./mock";

describe("runBuildTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);

    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_SOURCES_ACTIVE = 7;
    (global as any).FIND_STRUCTURES = 2;
    (global as any).FIND_CONSTRUCTION_SITES = 3;
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).STRUCTURE_SPAWN = "spawn";
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
    (global as any).TERRAIN_MASK_WALL = 1;
    (global as any).LOOK_STRUCTURES = "structure";
    (global as any).LOOK_CONSTRUCTION_SITES = "constructionSite";
    (global as any).CREEP_LIFE_TIME = 1500; // always 1500 in Screeps
    // PathFinder mock — connectivity check always passes by default
    (global as any).PathFinder = {
      search: (): { path: object[]; incomplete: boolean } => ({ path: [{}], incomplete: false }),
      CostMatrix: class {
        public set(_x: number, _y: number, _cost: number): void { /* noop */ }
        public clone(): object { return new (global as any).PathFinder.CostMatrix(); }
      }
    };
  });

  it("returns true only when no construction sites exist and all sources are container-covered", () => {
    const sourceWithContainer = {
      id: "source-1",
      pos: {
        x: 10,
        y: 10,
        findInRange: (findConstant: number): object[] =>
          findConstant === (global as any).FIND_STRUCTURES
            ? [{ structureType: (global as any).STRUCTURE_CONTAINER }]
            : []
      }
    };
    const sourceWithContainerSite = {
      id: "source-2",
      pos: {
        x: 20,
        y: 20,
        findInRange: (findConstant: number): object[] =>
          findConstant === (global as any).FIND_CONSTRUCTION_SITES
            ? [{ structureType: (global as any).STRUCTURE_CONTAINER }]
            : []
      }
    };

    let createCalls = 0;
    let buildCalls = 0;
    let harvestCalls = 0;
    let withdrawCalls = 0;

    const room = {
      storage: { store: { getUsedCapacity: (): number => 100 } },
      controller: {
        pos: {
          x: 30, y: 30,
          findInRange: (constant: number): object[] =>
            constant === (global as any).FIND_STRUCTURES
              ? [{ structureType: (global as any).STRUCTURE_CONTAINER }]
              : []
        }
      },
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [sourceWithContainer, sourceWithContainerSite];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [];
        return [];
      },
      createConstructionSite: (): number => {
        createCalls++;
        return 0;
      },
      getTerrain: () => ({ get: (): number => 0 }),
      lookForAt: (): object[] => []
    };

    const creep = {
      room,
      store: {
        getUsedCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): null => null
      },
      build: (): number => {
        buildCalls++;
        return 0;
      },
      moveTo: (): number => 0,
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      withdraw: (): number => {
        withdrawCalls++;
        return 0;
      }
    };

    const done = runBuildTask(creep as any);

    assert.isTrue(done);
    assert.equal(createCalls, 0);
    assert.equal(buildCalls, 0);
    assert.equal(harvestCalls, 0);
    assert.equal(withdrawCalls, 0);
  });

  it("does not return true when an unrelated non-container construction site exists", () => {
    const sourceWithContainer = {
      id: "source-1",
      pos: {
        x: 10,
        y: 10,
        findInRange: (findConstant: number): object[] =>
          findConstant === (global as any).FIND_STRUCTURES
            ? [{ structureType: (global as any).STRUCTURE_CONTAINER }]
            : []
      }
    };

    const roadSite = { id: "site-road", structureType: "road" };

    const room = {
      storage: undefined,
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [sourceWithContainer];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [roadSite];
        return [];
      },
      createConstructionSite: (): number => 0,
      getTerrain: () => ({ get: (): number => 0 }),
      lookForAt: (): object[] => []
    };

    const creep = {
      room,
      store: { getUsedCapacity: (): number => 50 },
      pos: {
        findClosestByRange: (findConstant: number): object | null =>
          findConstant === (global as any).FIND_CONSTRUCTION_SITES ? roadSite : null
      },
      build: (): number => 0,
      moveTo: (): number => 0,
      harvest: (): number => 0,
      withdraw: (): number => 0
    };

    assert.isFalse(runBuildTask(creep as any));
  });

  it("attempts exactly one container construction-site placement per uncovered source", () => {
    const coveredSource = {
      id: "source-covered",
      pos: {
        x: 6,
        y: 6,
        findInRange: (findConstant: number): object[] =>
          findConstant === (global as any).FIND_STRUCTURES
            ? [{ structureType: (global as any).STRUCTURE_CONTAINER }]
            : []
      }
    };

    const uncoveredA = {
      id: "source-a",
      pos: {
        x: 10,
        y: 10,
        findInRange: (): object[] => []
      }
    };

    const uncoveredB = {
      id: "source-b",
      pos: {
        x: 20,
        y: 20,
        findInRange: (): object[] => []
      }
    };

    const createCalls: Array<{ x: number; y: number; type: string }> = [];

    const room = {
      storage: undefined,
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [coveredSource, uncoveredA, uncoveredB];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [{ id: "site-1", structureType: "road" }];
        return [];
      },
      createConstructionSite: (x: number, y: number, type: string): number => {
        createCalls.push({ x, y, type });
        return 0;
      },
      getTerrain: () => ({ get: (): number => 0 }),
      lookForAt: (): object[] => []
    };

    const creep = {
      room,
      store: { getUsedCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (): null => null
      },
      build: (): number => 0,
      moveTo: (): number => 0,
      harvest: (): number => 0,
      withdraw: (): number => 0
    };

    runBuildTask(creep as any);

    assert.equal(createCalls.length, 2);
    assert.isTrue(createCalls.every(c => c.type === (global as any).STRUCTURE_CONTAINER));
  });

  it("computes an open adjacent tile by excluding walls, blocking structures, and construction sites", () => {
    const source = {
      id: "source-open-tile",
      pos: {
        x: 10,
        y: 10,
        findInRange: (): object[] => []
      }
    };

    const wallTiles = new Set(["9,9", "10,9", "11,9", "9,11", "10,11", "11,11", "11,10"]);
    const blockingStructureTiles = new Set(["10,9"]);
    const constructionSiteTiles = new Set(["11,9"]);

    const createCalls: Array<{ x: number; y: number; type: string }> = [];

    const room = {
      storage: undefined,
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [source];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [{ id: "site-1", structureType: "road" }];
        return [];
      },
      createConstructionSite: (x: number, y: number, type: string): number => {
        createCalls.push({ x, y, type });
        return 0;
      },
      getTerrain: () => ({
        get: (x: number, y: number): number => (wallTiles.has(`${x},${y}`) ? (global as any).TERRAIN_MASK_WALL : 0)
      }),
      lookForAt: (lookType: string, x: number, y: number): object[] => {
        const key = `${x},${y}`;
        if (lookType === (global as any).LOOK_STRUCTURES && blockingStructureTiles.has(key)) {
          return [{ structureType: (global as any).STRUCTURE_SPAWN }];
        }
        if (lookType === (global as any).LOOK_CONSTRUCTION_SITES && constructionSiteTiles.has(key)) {
          return [{ structureType: "road" }];
        }
        return [];
      }
    };

    const creep = {
      room,
      store: { getUsedCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (): null => null
      },
      build: (): number => 0,
      moveTo: (): number => 0,
      harvest: (): number => 0,
      withdraw: (): number => 0
    };

    runBuildTask(creep as any);

    assert.equal(createCalls.length, 1);
    assert.deepEqual(createCalls[0], {
      x: 9,
      y: 10,
      type: (global as any).STRUCTURE_CONTAINER
    });
  });

  it("withdraws from storage when creep has no energy and storage has energy", () => {
    const buildSite = { id: "site-1", structureType: "road" };
    const storage = { id: "storage-1", store: { getUsedCapacity: (): number => 100 } };
    let withdrawTarget: object | null = null;
    let withdrawResource: ResourceConstant | null = null;

    const room = {
      storage,
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [buildSite];
        return [];
      },
      createConstructionSite: (): number => 0,
      getTerrain: () => ({ get: (): number => 0 }),
      lookForAt: (): object[] => []
    };

    const creep = {
      room,
      store: { getUsedCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (): null => null
      },
      build: (): number => 0,
      moveTo: (): number => 0,
      harvest: (): number => 0,
      withdraw: (target: object, resource: ResourceConstant): number => {
        withdrawTarget = target;
        withdrawResource = resource;
        return 0;
      }
    };

    const done = runBuildTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(withdrawTarget, storage);
    assert.equal(withdrawResource, (global as any).RESOURCE_ENERGY);
  });

  it("harvests from a source when creep has no energy and storage is unavailable", () => {
    const buildSite = { id: "site-1", structureType: "road" };
    const source = { id: "source-1", pos: { x: 10, y: 10, findInRange: (): object[] => [] } };
    let harvestTarget: object | null = null;

    const room = {
      storage: undefined,
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [source];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [buildSite];
        return [];
      },
      createConstructionSite: (): number => 0,
      getTerrain: () => ({ get: (): number => 0 }),
      lookForAt: (): object[] => []
    };

    const creep = {
      room,
      store: { getUsedCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (findConstant: number): object | null =>
          findConstant === (global as any).FIND_SOURCES_ACTIVE ? source : null
      },
      build: (): number => 0,
      moveTo: (): number => 0,
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      withdraw: (): number => 0
    };

    const done = runBuildTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(harvestTarget, source);
  });

  it("does not harvest and returns false when no active source exists", () => {
    const buildSite = { id: "site-1", structureType: "road" };
    let harvestCalls = 0;

    const room = {
      storage: undefined,
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [buildSite];
        return [];
      },
      createConstructionSite: (): number => 0,
      getTerrain: () => ({ get: (): number => 0 }),
      lookForAt: (): object[] => []
    };

    const creep = {
      room,
      store: { getUsedCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (): null => null
      },
      build: (): number => 0,
      moveTo: (): number => 0,
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      withdraw: (): number => 0
    };

    const done = runBuildTask(creep as any);

    assert.isFalse(done);
    assert.equal(harvestCalls, 0);
  });

  it("builds nearest construction site when creep has energy and moves on ERR_NOT_IN_RANGE", () => {
    const source = {
      id: "source-1",
      pos: {
        x: 10,
        y: 10,
        findInRange: (findConstant: number): object[] =>
          findConstant === (global as any).FIND_STRUCTURES
            ? [{ structureType: (global as any).STRUCTURE_CONTAINER }]
            : []
      }
    };
    const nearSite = { id: "site-near", structureType: "road" };
    const farSite = { id: "site-far", structureType: "extension" };
    let buildTarget: object | null = null;
    let moveTarget: object | null = null;

    const room = {
      storage: undefined,
      find: (findConstant: number): object[] => {
        if (findConstant === (global as any).FIND_SOURCES) return [source];
        if (findConstant === (global as any).FIND_CONSTRUCTION_SITES) return [nearSite, farSite];
        return [];
      },
      createConstructionSite: (): number => 0,
      getTerrain: () => ({ get: (): number => 0 }),
      lookForAt: (): object[] => []
    };

    const creep = {
      room,
      store: { getUsedCapacity: (): number => 25 },
      pos: {
        findClosestByRange: (findConstant: number): object | null =>
          findConstant === (global as any).FIND_CONSTRUCTION_SITES ? nearSite : null
      },
      build: (target: object): number => {
        buildTarget = target;
        return (global as any).ERR_NOT_IN_RANGE;
      },
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      },
      harvest: (): number => 0,
      withdraw: (): number => 0
    };

    const done = runBuildTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(buildTarget, nearSite);
    assert.strictEqual(moveTarget, nearSite);
  });

  // ---------------------------------------------------------------------------
  // canBuildExpansions gate on placeExtensionSites
  // ---------------------------------------------------------------------------


  describe("extension placement gate", () => {
    beforeEach(() => {
      (global as any).WORK = "work";
      (global as any).BODYPART_COST = { work: 100, carry: 50, move: 50, tough: 10 };
      (global as any).CREEP_LIFE_TIME = 1500;
      (global as any).FIND_MY_SPAWNS = 4;
      (global as any).FIND_MY_STRUCTURES = 107;
      (global as any).STRUCTURE_EXTENSION = "extension";
      (global as any).CONTROLLER_STRUCTURES = {
        extension: { 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 }
      };
    });

    it("places extension sites when surplus income permits expansion", () => {
      // Memory.extensionPlan must be pre-seeded (in production this is done by
      // computeExtensionPlan in main.ts on RCL change).
      (global as any).Memory.extensionPlan = {
        W1N1: {
          rcl: 2,
          sites: [
            { x: 26, y: 25 },
            { x: 27, y: 25 },
            { x: 28, y: 25 },
            { x: 29, y: 25 },
            { x: 30, y: 25 }
          ]
        }
      };

      // 1 harvester with [WORK, CARRY, MOVE] → harvestRate = 2 e/tick
      // fleetCost ≈ 200/1500 ≈ 0.133 e/tick, upgraderCount = 0
      // canBuildExpansions(2, ~0.133, 200, 0) → remaining ≈ 1.87 ≥ 0.133 → true
      (global as any).Game.creeps = {
        H1: {
          memory: { task: "harvest", room: "W1N1" },
          body: [{ type: "work" }, { type: "carry" }, { type: "move" }]
        }
      };

      const extensionSites: { x: number; y: number; type: string }[] = [];
      const spawn = { pos: { x: 25, y: 25 } };

      const room = {
        name: "W1N1",
        controller: { level: 2 },
        storage: undefined,
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_SOURCES) return [];
          if (constant === (global as any).FIND_CONSTRUCTION_SITES) return [{ id: "s1", structureType: "road", pos: { x: 10, y: 10 } }];
          if (constant === (global as any).FIND_MY_SPAWNS) return [spawn];
          if (constant === (global as any).FIND_MY_STRUCTURES) return [];
          return [];
        },
        createConstructionSite: (x: number, y: number, type: string): number => {
          extensionSites.push({ x, y, type });
          return 0;
        },
        getTerrain: () => ({ get: (): number => 0 }),
        lookForAt: (): object[] => []
      };

      const creep = {
        room,
        store: { getUsedCapacity: (): number => 50 },
        pos: { findClosestByRange: (): object | null => ({ id: "s1", structureType: "road" }) },
        build: (): number => 0,
        moveTo: (): number => 0,
        harvest: (): number => 0,
        withdraw: (): number => 0
      };

      runBuildTask(creep as any);

      const extensionPlacements = extensionSites.filter(s => s.type === "extension");
      assert.isAtLeast(extensionPlacements.length, 1, "should place at least one extension site when income permits");
    });

    it("does NOT place extension sites when room has no harvesting creeps", () => {
      // No creeps → harvestRate = 0, fleetCost = 0, upgraderCount = 0
      // canBuildExpansions(0, 0, 200, 0) → remaining = 0 < amortised → false
      (global as any).Game.creeps = {};

      const extensionSites: { x: number; y: number; type: string }[] = [];
      const spawn = { pos: { x: 25, y: 25 } };

      const room = {
        name: "W1N1",
        controller: { level: 2 },
        storage: undefined,
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_SOURCES) return [];
          if (constant === (global as any).FIND_CONSTRUCTION_SITES) return [{ id: "s1", structureType: "road", pos: { x: 10, y: 10 } }];
          if (constant === (global as any).FIND_MY_SPAWNS) return [spawn];
          if (constant === (global as any).FIND_MY_STRUCTURES) return [];
          return [];
        },
        createConstructionSite: (x: number, y: number, type: string): number => {
          extensionSites.push({ x, y, type });
          return 0;
        },
        getTerrain: () => ({ get: (): number => 0 }),
        lookForAt: (): object[] => []
      };

      const creep = {
        room,
        store: { getUsedCapacity: (): number => 50 },
        pos: { findClosestByRange: (): object | null => ({ id: "s1", structureType: "road" }) },
        build: (): number => 0,
        moveTo: (): number => 0,
        harvest: (): number => 0,
        withdraw: (): number => 0
      };

      runBuildTask(creep as any);

      const extensionPlacements = extensionSites.filter(s => s.type === "extension");
      assert.equal(extensionPlacements.length, 0, "should NOT place extension sites when room has no income");
    });
  });

  // ---------------------------------------------------------------------------
  // computeExtensionPlan
  // ---------------------------------------------------------------------------

  describe("computeExtensionPlan", () => {
    beforeEach(() => {
      (global as any).FIND_MY_SPAWNS = 4;
      (global as any).FIND_MY_STRUCTURES = 107;
      (global as any).FIND_SOURCES = 1;
      (global as any).STRUCTURE_EXTENSION = "extension";
      (global as any).CONTROLLER_STRUCTURES = {
        extension: { 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 }
      };
      (global as any).TERRAIN_MASK_WALL = 1;
      (global as any).Memory.extensionPlan = {};
    });

    it("stores a plan in Memory keyed by room name with correct rcl", () => {
      const spawn = { pos: { x: 25, y: 25 } };
      const source = { pos: { x: 10, y: 10 } };
      const room = {
        name: "W1N1",
        controller: { level: 2, pos: { x: 30, y: 30 } },
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_MY_SPAWNS) return [spawn];
          if (constant === (global as any).FIND_SOURCES) return [source];
          if (constant === (global as any).FIND_MY_STRUCTURES) return [];
          return [];
        },
        getTerrain: () => ({ get: (): number => 0 })
      };

      computeExtensionPlan(room as any);

      const plan = (global as any).Memory.extensionPlan["W1N1"];
      assert.isDefined(plan, "plan should be stored in Memory");
      assert.equal(plan.rcl, 2);
      assert.isArray(plan.sites);
      // RCL2 quota = 5
      assert.equal(plan.sites.length, 5, "should plan exactly quota extension sites");
    });

    it("plans fewer sites than quota when walls block candidate tiles", () => {
      const spawn = { pos: { x: 25, y: 25 } };
      // Make all tiles walls except the spawn tile itself
      const room = {
        name: "W1N2",
        controller: { level: 2, pos: { x: 30, y: 30 } },
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_MY_SPAWNS) return [spawn];
          if (constant === (global as any).FIND_SOURCES) return [];
          if (constant === (global as any).FIND_MY_STRUCTURES) return [];
          return [];
        },
        getTerrain: () => ({
          get: (x: number, y: number): number =>
            // wall everything except spawn tile so no valid placements exist
            x === 25 && y === 25 ? 0 : (global as any).TERRAIN_MASK_WALL
        })
      };

      computeExtensionPlan(room as any);

      const plan = (global as any).Memory.extensionPlan["W1N2"];
      assert.isDefined(plan);
      assert.equal(plan.sites.length, 0, "no sites should be planned when all tiles are walls");
    });

    it("overwrites an existing plan when called again", () => {
      (global as any).Memory.extensionPlan = {
        W1N3: { rcl: 1, sites: [{ x: 1, y: 1 }] }
      };

      const spawn = { pos: { x: 25, y: 25 } };
      const room = {
        name: "W1N3",
        controller: { level: 2, pos: { x: 30, y: 30 } },
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_MY_SPAWNS) return [spawn];
          if (constant === (global as any).FIND_SOURCES) return [];
          if (constant === (global as any).FIND_MY_STRUCTURES) return [];
          return [];
        },
        getTerrain: () => ({ get: (): number => 0 })
      };

      computeExtensionPlan(room as any);

      const plan = (global as any).Memory.extensionPlan["W1N3"];
      assert.equal(plan.rcl, 2, "plan rcl should be updated to new RCL");
      assert.notDeepEqual(plan.sites, [{ x: 1, y: 1 }], "old sites should be overwritten");
    });
  });

  // ---------------------------------------------------------------------------
  // Controller container placement (U3)
  // ---------------------------------------------------------------------------

  describe("controller container placement (U3)", () => {
    beforeEach(() => {
      (global as any).FIND_STRUCTURES = 2;
      (global as any).STRUCTURE_CONTAINER = "container";
      (global as any).FIND_CONSTRUCTION_SITES = 3;
    });

    it("placeControllerContainerSite places a container site adjacent to the controller when none exists", () => {
      const coveredSource = {
        id: "source-covered",
        pos: {
          x: 5, y: 5,
          findInRange: (constant: number): object[] =>
            constant === (global as any).FIND_STRUCTURES
              ? [{ structureType: "container" }]
              : []
        }
      };

      const controllerPos = { x: 20, y: 20, findInRange: (): object[] => [] };
      const createCalls: { x: number; y: number; type: string }[] = [];

      const room = {
        name: "W1N1",
        controller: { pos: controllerPos },
        storage: undefined,
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_SOURCES) return [coveredSource];
          if (constant === (global as any).FIND_CONSTRUCTION_SITES) return [];
          return [];
        },
        createConstructionSite: (x: number, y: number, type: string): number => {
          createCalls.push({ x, y, type });
          return 0;
        },
        getTerrain: () => ({ get: (): number => 0 }),
        lookForAt: (): object[] => []
      };

      const creep = {
        room,
        store: { getUsedCapacity: (): number => 50 },
        pos: { findClosestByRange: (): null => null },
        build: (): number => 0,
        moveTo: (): number => 0,
        harvest: (): number => 0,
        withdraw: (): number => 0
      };

      (global as any).Game.creeps = {};

      runBuildTask(creep as any);

      // A container site should have been placed adjacent to the controller
      const containerSites = createCalls.filter(c => c.type === "container");
      assert.isAtLeast(containerSites.length, 1, "should place a controller container site");

      // The placed site must be adjacent to controller (within range 1)
      for (const site of containerSites) {
        const dx = Math.abs(site.x - controllerPos.x);
        const dy = Math.abs(site.y - controllerPos.y);
        assert.isAtMost(Math.max(dx, dy), 1, "controller container site must be within range 1 of controller");
      }
    });

    it("does NOT place a controller container site when one already exists (built container within range 1)", () => {
      const coveredSource = {
        id: "source-covered",
        pos: {
          x: 5, y: 5,
          findInRange: (constant: number): object[] =>
            constant === (global as any).FIND_STRUCTURES
              ? [{ structureType: "container" }]
              : []
        }
      };

      const controllerPos = { x: 20, y: 20 };

      let createCalls = 0;
      const room = {
        name: "W1N1",
        controller: {
          pos: {
            ...controllerPos,
            findInRange: (constant: number): object[] =>
              constant === (global as any).FIND_STRUCTURES
                ? [{ structureType: "container" }]
                : []
          }
        },
        storage: undefined,
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_SOURCES) return [coveredSource];
          if (constant === (global as any).FIND_CONSTRUCTION_SITES) return [];
          return [];
        },
        createConstructionSite: (): number => { createCalls++; return 0; },
        getTerrain: () => ({ get: (): number => 0 }),
        lookForAt: (): object[] => []
      };

      const creep = {
        room,
        store: { getUsedCapacity: (): number => 50 },
        pos: { findClosestByRange: (): null => null },
        build: (): number => 0,
        moveTo: (): number => 0,
        harvest: (): number => 0,
        withdraw: (): number => 0
      };

      (global as any).Game.creeps = {};
      (global as any).WORK = "work";
      (global as any).BODYPART_COST = { work: 100, carry: 50, move: 50 };
      (global as any).CREEP_LIFE_TIME = 1500;
      (global as any).FIND_MY_SPAWNS = 4;
      (global as any).FIND_MY_STRUCTURES = 107;
      (global as any).STRUCTURE_EXTENSION = "extension";
      (global as any).CONTROLLER_STRUCTURES = { extension: { 1: 0, 2: 5 } };

      runBuildTask(creep as any);

      assert.equal(createCalls, 0, "must not place another container site when one already exists");
    });

    it("does NOT place a controller container site when a container construction site exists within range 1", () => {
      const coveredSource = {
        id: "source-covered",
        pos: {
          x: 5, y: 5,
          findInRange: (constant: number): object[] =>
            constant === (global as any).FIND_STRUCTURES
              ? [{ structureType: "container" }]
              : []
        }
      };

      const controllerPos = { x: 20, y: 20 };

      let createCalls = 0;
      const room = {
        name: "W1N1",
        controller: {
          pos: {
            ...controllerPos,
            findInRange: (constant: number): object[] =>
              constant === (global as any).FIND_CONSTRUCTION_SITES
                ? [{ structureType: "container" }]  // site, not built structure
                : []
          }
        },
        storage: undefined,
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_SOURCES) return [coveredSource];
          if (constant === (global as any).FIND_CONSTRUCTION_SITES) return [];
          return [];
        },
        createConstructionSite: (): number => { createCalls++; return 0; },
        getTerrain: () => ({ get: (): number => 0 }),
        lookForAt: (): object[] => []
      };

      const creep = {
        room,
        store: { getUsedCapacity: (): number => 50 },
        pos: { findClosestByRange: (): null => null },
        build: (): number => 0,
        moveTo: (): number => 0,
        harvest: (): number => 0,
        withdraw: (): number => 0
      };

      (global as any).Game.creeps = {};
      (global as any).WORK = "work";
      (global as any).BODYPART_COST = { work: 100, carry: 50, move: 50 };
      (global as any).CREEP_LIFE_TIME = 1500;
      (global as any).FIND_MY_SPAWNS = 4;
      (global as any).FIND_MY_STRUCTURES = 107;
      (global as any).STRUCTURE_EXTENSION = "extension";
      (global as any).CONTROLLER_STRUCTURES = { extension: { 1: 0, 2: 5 } };

      runBuildTask(creep as any);

      assert.equal(createCalls, 0, "must not place a controller container site when one is already under construction");
    });

    it("returns false when sources are covered but controller has no adjacent container (not done until U3)", () => {
      // After U3, the completion condition includes hasAdjacentControllerContainer.
      // Currently runBuildTask returns true here (bug). After U3: returns false.
      // So this test FAILS until U3.
      const coveredSource = {
        id: "source-covered",
        pos: {
          x: 5, y: 5,
          findInRange: (constant: number): object[] =>
            constant === (global as any).FIND_STRUCTURES
              ? [{ structureType: "container" }]
              : []
        }
      };

      // Controller has NO adjacent container
      const room = {
        name: "W1N1",
        controller: {
          pos: {
            x: 20, y: 20,
            findInRange: (): object[] => [] // no container near controller
          }
        },
        storage: undefined,
        find: (constant: number): any[] => {
          if (constant === (global as any).FIND_SOURCES) return [coveredSource];
          if (constant === (global as any).FIND_CONSTRUCTION_SITES) return [];
          return [];
        },
        createConstructionSite: (): number => 0,
        getTerrain: () => ({ get: (): number => 0 }),
        lookForAt: (): object[] => []
      };

      const creep = {
        room,
        store: { getUsedCapacity: (): number => 0 },
        pos: { findClosestByRange: (): null => null },
        build: (): number => 0,
        moveTo: (): number => 0,
        harvest: (): number => 0,
        withdraw: (): number => 0
      };

      (global as any).Game.creeps = {};

      const done = runBuildTask(creep as any);

      // Until U3: runBuildTask returns true here (bug). After U3: returns false.
      assert.isFalse(done, "should not be done when controller has no adjacent container");
    });
  });
});
