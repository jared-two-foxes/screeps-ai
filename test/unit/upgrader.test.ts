import { assert } from "chai";
import { runUpgrader } from "../../src/roles/upgrader";
import { Game, Memory } from "./mock";

describe("upgrader role", () => {
  beforeEach(() => {
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);

    (global as any).FIND_SOURCES_ACTIVE = 3;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  it("transitions to gathering when empty and targets closest active source", () => {
    const source = { id: "source1" };
    let findCalls = 0;
    let harvestTarget: object | null = null;

    const creep = {
      memory: { role: "upgrader", working: true },
      room: { controller: { id: "controller1" }, storage: undefined },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          findCalls++;
          assert.equal(findConstant, (global as any).FIND_SOURCES_ACTIVE);
          return source;
        }
      },
      withdraw: (): number => 0,
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    runUpgrader(creep as any);

    assert.isFalse(creep.memory.working);
    assert.equal(findCalls, 1);
    assert.strictEqual(harvestTarget, source);
  });

  it("transitions to working when full and upgrades the room controller", () => {
    const controller = { id: "controller1" };
    let upgradeTarget: object | null = null;

    const creep = {
      memory: { role: "upgrader", working: false },
      room: { controller, storage: undefined },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: { findClosestByRange: (): object | null => null },
      withdraw: (): number => 0,
      harvest: (): number => 0,
      upgradeController: (target: object): number => {
        upgradeTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    runUpgrader(creep as any);

    assert.isTrue(creep.memory.working);
    assert.strictEqual(upgradeTarget, controller);
  });

  it("treats undefined memory.working as gathering and prefers storage withdraw", () => {
    const storage = { id: "storage1", store: { getUsedCapacity: (): number => 50 } };
    let withdrawTarget: object | null = null;
    let withdrawResource: ResourceConstant | null = null;
    let harvestCalls = 0;

    const creep = {
      memory: { role: "upgrader" },
      room: { controller: { id: "controller1" }, storage },
      store: {
        getUsedCapacity: (): number => 5,
        getFreeCapacity: (): number => 5
      },
      pos: { findClosestByRange: (): object | null => null },
      withdraw: (target: object, resource: ResourceConstant): number => {
        withdrawTarget = target;
        withdrawResource = resource;
        return 0;
      },
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    runUpgrader(creep as any);

    assert.strictEqual(withdrawTarget, storage);
    assert.equal(withdrawResource, (global as any).RESOURCE_ENERGY);
    assert.equal(harvestCalls, 0);
  });

  it("falls back to active sources when storage is undefined", () => {
    const source = { id: "source1" };
    let harvestTarget: object | null = null;

    const creep = {
      memory: { role: "upgrader", working: false },
      room: { controller: { id: "controller1" }, storage: undefined },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: { findClosestByRange: (): object | null => source },
      withdraw: (): number => 0,
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    runUpgrader(creep as any);

    assert.strictEqual(harvestTarget, source);
  });

  it("falls back to active sources when storage has no energy", () => {
    const source = { id: "source1" };
    let harvestTarget: object | null = null;
    let withdrawCalls = 0;

    const creep = {
      memory: { role: "upgrader", working: false },
      room: {
        controller: { id: "controller1" },
        storage: { id: "storage1", store: { getUsedCapacity: (): number => 0 } }
      },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: { findClosestByRange: (): object | null => source },
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

    runUpgrader(creep as any);

    assert.equal(withdrawCalls, 0);
    assert.strictEqual(harvestTarget, source);
  });

  it("calls moveTo(storage) when withdraw returns ERR_NOT_IN_RANGE", () => {
    const storage = { id: "storage1", store: { getUsedCapacity: (): number => 50 } };
    let moveTarget: object | null = null;

    const creep = {
      memory: { role: "upgrader", working: false },
      room: { controller: { id: "controller1" }, storage },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: { findClosestByRange: (): object | null => null },
      withdraw: (): number => (global as any).ERR_NOT_IN_RANGE,
      harvest: (): number => 0,
      upgradeController: (): number => 0,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runUpgrader(creep as any);

    assert.strictEqual(moveTarget, storage);
  });

  it("calls moveTo(source) when harvest returns ERR_NOT_IN_RANGE", () => {
    const source = { id: "source1" };
    let moveTarget: object | null = null;

    const creep = {
      memory: { role: "upgrader", working: false },
      room: {
        controller: { id: "controller1" },
        storage: { id: "storage1", store: { getUsedCapacity: (): number => 0 } }
      },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: { findClosestByRange: (): object | null => source },
      withdraw: (): number => 0,
      harvest: (): number => (global as any).ERR_NOT_IN_RANGE,
      upgradeController: (): number => 0,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runUpgrader(creep as any);

    assert.strictEqual(moveTarget, source);
  });

  it("calls moveTo(controller) when upgradeController returns ERR_NOT_IN_RANGE", () => {
    const controller = { id: "controller1" };
    let moveTarget: object | null = null;

    const creep = {
      memory: { role: "upgrader", working: true },
      room: { controller, storage: undefined },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: { findClosestByRange: (): object | null => null },
      withdraw: (): number => 0,
      harvest: (): number => 0,
      upgradeController: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runUpgrader(creep as any);

    assert.strictEqual(moveTarget, controller);
  });

  it("idles safely when room.controller is undefined", () => {
    let upgradeCalls = 0;
    let moveCalls = 0;

    const creep = {
      memory: { role: "upgrader", working: true },
      room: { controller: undefined, storage: undefined },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: { findClosestByRange: (): object | null => null },
      withdraw: (): number => 0,
      harvest: (): number => 0,
      upgradeController: (): number => {
        upgradeCalls++;
        return 0;
      },
      moveTo: (): number => {
        moveCalls++;
        return 0;
      }
    };

    assert.doesNotThrow(() => runUpgrader(creep as any));
    assert.equal(upgradeCalls, 0);
    assert.equal(moveCalls, 0);
  });

  it("idles safely when storage is unusable and no active sources exist", () => {
    let withdrawCalls = 0;
    let harvestCalls = 0;
    let moveCalls = 0;

    const creep = {
      memory: { role: "upgrader", working: false },
      room: {
        controller: { id: "controller1" },
        storage: { id: "storage1", store: { getUsedCapacity: (): number => 0 } }
      },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: { findClosestByRange: (): object | null => null },
      withdraw: (): number => {
        withdrawCalls++;
        return 0;
      },
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      upgradeController: (): number => 0,
      moveTo: (): number => {
        moveCalls++;
        return 0;
      }
    };

    assert.doesNotThrow(() => runUpgrader(creep as any));
    assert.equal(withdrawCalls, 0);
    assert.equal(harvestCalls, 0);
    assert.equal(moveCalls, 0);
  });
});
