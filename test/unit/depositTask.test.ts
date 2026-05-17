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
