import { assert } from "chai";
import { runDepositTask } from "../../src/tasks/deposit";
import { Game, Memory } from "./mock";

describe("runDepositTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).FIND_MY_STRUCTURES = 108;
    (global as any).STRUCTURE_EXTENSION = "extension";
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
    (global as any).ERR_FULL = -8;
  });

  // Helper: returns null for FIND_MY_STRUCTURES (no extensions), returns `obj`
  // for FIND_MY_SPAWNS. Mirrors how real Screeps behaves when no extensions exist.
  const noExtension = (obj: object | null) => (constant: number): object | null =>
    constant === (global as any).FIND_MY_STRUCTURES ? null : obj;

  // -------------------------------------------------------------------------
  // Completion conditions
  // -------------------------------------------------------------------------

  it("returns true (complete) when store is empty", () => {
    const creep = {
      store: { getUsedCapacity: (): number => 0 },
      room: { storage: undefined },
      pos: { findClosestByRange: (): null => null, getRangeTo: (): number => 0 },
      transfer: (): number => 0,
      moveTo: (): number => 0
    };

    assert.isTrue(runDepositTask(creep as any));
  });

  it("returns true (complete) when no target exists (spawn, storage, and extensions all unavailable)", () => {
    let transferCalls = 0;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage: undefined },
      pos: { findClosestByRange: (): null => null, getRangeTo: (): number => 0 },
      transfer: (): number => {
        transferCalls++;
        return 0;
      },
      moveTo: (): number => 0
    };

    assert.isTrue(runDepositTask(creep as any));
    assert.equal(transferCalls, 0);
  });

  it("returns true (complete) when spawn target returns ERR_FULL", () => {
    const spawn = { id: "spawn1" };

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage: undefined },
      pos: {
        findClosestByRange: noExtension(spawn),
        getRangeTo: (): number => 1
      },
      transfer: (): number => (global as any).ERR_FULL,
      moveTo: (): number => 0
    };

    assert.isTrue(runDepositTask(creep as any));
  });

  // -------------------------------------------------------------------------
  // Transfer to spawn
  // -------------------------------------------------------------------------

  it("transfers to spawn when no storage exists", () => {
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage: undefined },
      pos: {
        findClosestByRange: noExtension(spawn),
        getRangeTo: (): number => 3
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    const done = runDepositTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(transferTarget, spawn);
  });

  it("moves to spawn when transfer returns ERR_NOT_IN_RANGE", () => {
    const spawn = { id: "spawn1" };
    let moveTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage: undefined },
      pos: {
        findClosestByRange: noExtension(spawn),
        getRangeTo: (): number => 3
      },
      transfer: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runDepositTask(creep as any);

    assert.strictEqual(moveTarget, spawn);
  });

  // -------------------------------------------------------------------------
  // Target selection — spawn vs storage proximity
  // -------------------------------------------------------------------------

  it("chooses storage when storage is closer than spawn", () => {
    const storage = {
      id: "storage1",
      store: { getFreeCapacity: (): number => 500 }
    };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage },
      pos: {
        findClosestByRange: noExtension(spawn),
        getRangeTo: (target: { id: string }): number => (target.id === "storage1" ? 2 : 5)
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    runDepositTask(creep as any);

    assert.strictEqual(transferTarget, storage);
  });

  it("chooses spawn when spawn is closer than storage", () => {
    const storage = {
      id: "storage1",
      store: { getFreeCapacity: (): number => 500 }
    };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage },
      pos: {
        findClosestByRange: noExtension(spawn),
        getRangeTo: (target: { id: string }): number => (target.id === "spawn1" ? 1 : 4)
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    runDepositTask(creep as any);

    assert.strictEqual(transferTarget, spawn);
  });

  it("defaults to storage when storage and spawn are equidistant", () => {
    const storage = {
      id: "storage1",
      store: { getFreeCapacity: (): number => 500 }
    };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage },
      pos: {
        findClosestByRange: noExtension(spawn),
        getRangeTo: (): number => 3
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    assert.doesNotThrow(() => runDepositTask(creep as any));
    assert.strictEqual(transferTarget, storage);
  });

  it("falls back to spawn when storage exists but is full", () => {
    const storage = {
      id: "storage1",
      store: { getFreeCapacity: (): number => 0 }
    };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage },
      pos: {
        findClosestByRange: noExtension(spawn),
        getRangeTo: (): number => 3
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    runDepositTask(creep as any);

    assert.strictEqual(transferTarget, spawn);
  });

  it("falls back to storage when no spawn exists", () => {
    const storage = {
      id: "storage1",
      store: { getFreeCapacity: (): number => 500 }
    };
    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage },
      pos: {
        findClosestByRange: (): null => null,
        getRangeTo: (): number => 3
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    runDepositTask(creep as any);

    assert.strictEqual(transferTarget, storage);
  });

  // -------------------------------------------------------------------------
  // Extension filling — Priority 1
  // -------------------------------------------------------------------------

  it("transfers to extension before spawn when both are available", () => {
    const extension = { id: "ext1", structureType: "extension" };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage: undefined },
      pos: {
        findClosestByRange: (constant: number): object | null =>
          constant === (global as any).FIND_MY_STRUCTURES ? extension : spawn,
        getRangeTo: (): number => 3
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    const done = runDepositTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(transferTarget, extension);
  });

  it("moves to extension when transfer returns ERR_NOT_IN_RANGE", () => {
    const extension = { id: "ext1", structureType: "extension" };
    let moveTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { storage: undefined },
      pos: {
        findClosestByRange: (constant: number): object | null =>
          constant === (global as any).FIND_MY_STRUCTURES ? extension : null,
        getRangeTo: (): number => 5
      },
      transfer: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runDepositTask(creep as any);

    assert.strictEqual(moveTarget, extension);
  });

  it("returns false (not done) after depositing into extension", () => {
    const extension = { id: "ext1", structureType: "extension" };

    const creep = {
      store: { getUsedCapacity: (): number => 50 },
      room: { storage: undefined },
      pos: {
        findClosestByRange: (constant: number): object | null =>
          constant === (global as any).FIND_MY_STRUCTURES ? extension : null,
        getRangeTo: (): number => 1
      },
      transfer: (): number => 0,
      moveTo: (): number => 0
    };

    assert.isFalse(runDepositTask(creep as any));
  });
});

// ---------------------------------------------------------------------------
// Controller container priority (U5)
// ---------------------------------------------------------------------------

describe("controller container priority (U5)", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone({ creeps: {}, rooms: [], spawns: {}, time: 12345 });
    // @ts-ignore
    global.Memory = _.clone({ creeps: {} });
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).FIND_MY_STRUCTURES = 108;
    (global as any).FIND_STRUCTURES = 6;
    (global as any).STRUCTURE_EXTENSION = "extension";
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
    (global as any).ERR_FULL = -8;
  });

  it("deposits into controller container (Priority 3) when extensions and spawn are full but controller container has room", () => {
    // Current deposit.ts has no controller container step.
    // This test will FAIL until U5 adds step 3.
    const controllerContainer = {
      id: "ctrl-container",
      structureType: "container",
      store: {
        getUsedCapacity: (): number => 500,
        getCapacity: (): number => 2000,
        getFreeCapacity: (): number => 1500  // 25% full → below 80% → eligible
      }
    };

    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 50 },
      room: {
        storage: undefined,
        controller: {
          pos: {
            x: 20, y: 20,
            findInRange: (constant: number): any[] => {
              if (constant === (global as any).FIND_STRUCTURES) return [controllerContainer];
              return [];
            }
          }
        }
      },
      pos: {
        findClosestByRange: (constant: number): object | null => {
          if (constant === (global as any).FIND_MY_SPAWNS) return null;
          if (constant === (global as any).FIND_MY_STRUCTURES) return null;
          return null;
        },
        getRangeTo: (): number => 3
      },
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    runDepositTask(creep as any);

    assert.strictEqual(transferTarget, controllerContainer,
      "hauler should deposit into the controller container when extensions and spawn are unavailable");
  });

  it("skips controller container when it is at or above 80% full", () => {
    // Controller container is 90% full → should not be used; fall through to no-target → return true.
    const fullControllerContainer = {
      id: "ctrl-container-full",
      structureType: "container",
      store: {
        getUsedCapacity: (): number => 1800,
        getCapacity: (): number => 2000,
        getFreeCapacity: (): number => 200  // 90% full → above 80% threshold → skip
      }
    };

    let transferCalls = 0;

    const creep = {
      store: { getUsedCapacity: (): number => 50 },
      room: {
        storage: undefined,
        controller: {
          pos: {
            x: 20, y: 20,
            findInRange: (constant: number): any[] => {
              if (constant === (global as any).FIND_STRUCTURES) return [fullControllerContainer];
              return [];
            }
          }
        }
      },
      pos: {
        findClosestByRange: (constant: number): object | null => {
          if (constant === (global as any).FIND_MY_SPAWNS) return null;
          if (constant === (global as any).FIND_MY_STRUCTURES) return null;
          return null;
        },
        getRangeTo: (): number => 3
      },
      transfer: (): number => { transferCalls++; return 0; },
      moveTo: (): number => 0
    };

    const done = runDepositTask(creep as any);

    // No valid target → should return true (complete with nowhere to go)
    assert.isTrue(done, "should return true when controller container is too full and no other targets");
    assert.equal(transferCalls, 0, "should not attempt transfer when controller container is above 80% full");
  });

  it("deposits into spawn (Priority 2) before controller container when spawn has room", () => {
    // Spawn has free capacity → should go to spawn before controller container.
    const spawn = { id: "spawn1", store: { getFreeCapacity: (): number => 100 } };
    const controllerContainer = {
      id: "ctrl-container",
      structureType: "container",
      store: { getUsedCapacity: (): number => 100, getCapacity: (): number => 2000, getFreeCapacity: (): number => 1900 }
    };

    let transferTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 50 },
      room: {
        storage: undefined,
        controller: { pos: { x: 20, y: 20 } }
      },
      pos: {
        findClosestByRange: (constant: number): object | null => {
          if (constant === (global as any).FIND_MY_STRUCTURES) return null; // no extensions
          if (constant === (global as any).FIND_MY_SPAWNS) return spawn;
          if (constant === (global as any).FIND_STRUCTURES) return controllerContainer;
          return null;
        },
        getRangeTo: (): number => 2
      },
      transfer: (target: object): number => { transferTarget = target; return 0; },
      moveTo: (): number => 0
    };

    runDepositTask(creep as any);

    assert.strictEqual(transferTarget, spawn, "should deposit into spawn before controller container");
  });
});
