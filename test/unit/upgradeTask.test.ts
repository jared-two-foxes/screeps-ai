import { assert } from "chai";
import { runUpgradeTask } from "../../src/tasks/upgrade";
import { Game, Memory } from "./mock";

describe("runUpgradeTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES_ACTIVE = 3;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  // -------------------------------------------------------------------------
  // Creep has energy — upgrading branch
  // -------------------------------------------------------------------------

  it("returns false and upgrades the controller when creep has energy", () => {
    const controller = { id: "controller1" };
    let upgradeTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { controller, storage: undefined },
      pos: { findClosestByRange: (): null => null },
      withdraw: (): number => 0,
      harvest: (): number => 0,
      upgradeController: (target: object): number => {
        upgradeTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    const done = runUpgradeTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(upgradeTarget, controller);
  });

  it("moves to controller when upgradeController returns ERR_NOT_IN_RANGE", () => {
    const controller = { id: "controller1" };
    let moveTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { controller, storage: undefined },
      pos: { findClosestByRange: (): null => null },
      withdraw: (): number => 0,
      harvest: (): number => 0,
      upgradeController: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runUpgradeTask(creep as any);

    assert.strictEqual(moveTarget, controller);
  });

  it("returns true (complete) when creep has energy but no controller exists", () => {
    const creep = {
      store: { getUsedCapacity: (): number => 10 },
      room: { controller: undefined, storage: undefined },
      pos: { findClosestByRange: (): null => null },
      withdraw: (): number => 0,
      harvest: (): number => 0,
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    assert.isTrue(runUpgradeTask(creep as any));
  });

  // -------------------------------------------------------------------------
  // Creep is empty — energy gathering branch
  // -------------------------------------------------------------------------

  it("withdraws from storage when empty and storage has energy", () => {
    const storage = { id: "storage1", store: { getUsedCapacity: (): number => 50 } };
    let withdrawTarget: object | null = null;
    let withdrawResource: ResourceConstant | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 0 },
      room: {
        controller: { id: "controller1" },
        storage
      },
      pos: { findClosestByRange: (): null => null },
      withdraw: (target: object, resource: ResourceConstant): number => {
        withdrawTarget = target;
        withdrawResource = resource;
        return 0;
      },
      harvest: (): number => 0,
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    const done = runUpgradeTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(withdrawTarget, storage);
    assert.equal(withdrawResource, (global as any).RESOURCE_ENERGY);
  });

  it("moves to storage when withdraw returns ERR_NOT_IN_RANGE", () => {
    const storage = { id: "storage1", store: { getUsedCapacity: (): number => 50 } };
    let moveTarget: object | null = null;

    const creep = {
      store: { getUsedCapacity: (): number => 0 },
      room: { controller: { id: "controller1" }, storage },
      pos: { findClosestByRange: (): null => null },
      withdraw: (): number => (global as any).ERR_NOT_IN_RANGE,
      harvest: (): number => 0,
      upgradeController: (): number => 0,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runUpgradeTask(creep as any);

    assert.strictEqual(moveTarget, storage);
  });

  it("falls back to harvesting an active source when storage is unavailable", () => {
    const source = { id: "source1" };
    let harvestTarget: object | null = null;

    const creep = {
      memory: {},
      store: { getUsedCapacity: (): number => 0 },
      room: { controller: { id: "controller1" }, storage: undefined },
      pos: { findClosestByRange: (): object => source },
      withdraw: (): number => 0,
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    const done = runUpgradeTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(harvestTarget, source);
  });

  it("falls back to harvesting when storage exists but has no energy", () => {
    const source = { id: "source1" };
    let withdrawCalls = 0;
    let harvestTarget: object | null = null;

    const creep = {
      memory: {},
      store: { getUsedCapacity: (): number => 0 },
      room: {
        controller: { id: "controller1" },
        storage: { id: "storage1", store: { getUsedCapacity: (): number => 0 } }
      },
      pos: { findClosestByRange: (): object => source },
      withdraw: (): number => {
        withdrawCalls++;
        return 0;
      },
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    runUpgradeTask(creep as any);

    assert.equal(withdrawCalls, 0);
    assert.strictEqual(harvestTarget, source);
  });

  it("moves to source when harvest returns ERR_NOT_IN_RANGE", () => {
    const source = { id: "source1" };
    let moveTarget: object | null = null;

    const creep = {
      memory: {},
      store: { getUsedCapacity: (): number => 0 },
      room: { controller: { id: "controller1" }, storage: undefined },
      pos: { findClosestByRange: (): object => source },
      withdraw: (): number => 0,
      harvest: (): number => (global as any).ERR_NOT_IN_RANGE,
      upgradeController: (): number => 0,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runUpgradeTask(creep as any);

    assert.strictEqual(moveTarget, source);
  });

  it("returns true (complete) when empty and no active source or storage exists", () => {
    let upgradeCalls = 0;

    const creep = {
      memory: {},
      store: { getUsedCapacity: (): number => 0 },
      room: { controller: { id: "controller1" }, storage: undefined },
      pos: { findClosestByRange: (): null => null },
      withdraw: (): number => 0,
      harvest: (): number => 0,
      upgradeController: (): number => {
        upgradeCalls++;
        return 0;
      },
      moveTo: (): number => 0
    };

    assert.isTrue(runUpgradeTask(creep as any));
    assert.equal(upgradeCalls, 0);
  });

  it("harvests from pinned sourceId when set, ignoring findClosestByRange", () => {
    const pinnedSource = { id: "pinned-src" };
    let harvestTarget: object | null = null;
    let findClosestCalls = 0;

    (global as any).Game.getObjectById = (id: string): object | null =>
      id === "pinned-src" ? pinnedSource : null;

    const creep = {
      memory: { role: "upgrader", room: "W1N1", sourceId: "pinned-src" },
      store: { getUsedCapacity: (): number => 0 },
      room: { controller: { id: "c1" }, storage: undefined },
      pos: { findClosestByRange: (): null => { findClosestCalls++; return null; } },
      withdraw: (): number => 0,
      harvest: (t: object): number => { harvestTarget = t; return 0; },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    runUpgradeTask(creep as any);

    assert.strictEqual(harvestTarget, pinnedSource);
    assert.equal(findClosestCalls, 0);
  });
});
