import { assert } from "chai";
import { runForageTask } from "../../src/tasks/forage";
import { Game, Memory } from "./mock";

describe("runForageTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_STRUCTURES = 2;
    (global as any).FIND_DROPPED_RESOURCES = 106;
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  it("returns true (complete) when creep is already full", () => {
    let withdrawCalls = 0;
    let pickupCalls = 0;

    const creep = {
      store: { getFreeCapacity: (): number => 0 },
      pos: { findClosestByRange: (): null => null },
      withdraw: (): number => {
        withdrawCalls++;
        return 0;
      },
      pickup: (): number => {
        pickupCalls++;
        return 0;
      },
      moveTo: (): number => 0
    };

    assert.isTrue(runForageTask(creep as any));
    assert.equal(withdrawCalls, 0);
    assert.equal(pickupCalls, 0);
  });

  it("withdraws from a container with energy and returns false", () => {
    const container = {
      id: "container1",
      structureType: (global as any).STRUCTURE_CONTAINER,
      store: { getUsedCapacity: (): number => 200 }
    };
    let withdrawTarget: object | null = null;
    let withdrawResource: ResourceConstant | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 50 },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          if (findConstant === (global as any).FIND_STRUCTURES) return container;
          return null;
        }
      },
      withdraw: (target: object, resource: ResourceConstant): number => {
        withdrawTarget = target;
        withdrawResource = resource;
        return 0;
      },
      pickup: (): number => 0,
      moveTo: (): number => 0
    };

    const done = runForageTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(withdrawTarget, container);
    assert.equal(withdrawResource, (global as any).RESOURCE_ENERGY);
  });

  it("moves to container when withdraw returns ERR_NOT_IN_RANGE", () => {
    const container = {
      id: "container1",
      structureType: (global as any).STRUCTURE_CONTAINER,
      store: { getUsedCapacity: (): number => 200 }
    };
    let moveTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 50 },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          if (findConstant === (global as any).FIND_STRUCTURES) return container;
          return null;
        }
      },
      withdraw: (): number => (global as any).ERR_NOT_IN_RANGE,
      pickup: (): number => 0,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    const done = runForageTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(moveTarget, container);
  });

  it("falls back to dropped energy when no container with energy is available", () => {
    const emptyContainer = {
      id: "container1",
      structureType: (global as any).STRUCTURE_CONTAINER,
      store: { getUsedCapacity: (): number => 0 }
    };
    const dropped = { id: "drop1", resourceType: (global as any).RESOURCE_ENERGY, amount: 75 };
    let withdrawCalls = 0;
    let pickupTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 50 },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          if (findConstant === (global as any).FIND_STRUCTURES) return emptyContainer;
          if (findConstant === (global as any).FIND_DROPPED_RESOURCES) return dropped;
          return null;
        }
      },
      withdraw: (): number => {
        withdrawCalls++;
        return 0;
      },
      pickup: (target: object): number => {
        pickupTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    const done = runForageTask(creep as any);

    assert.isFalse(done);
    assert.equal(withdrawCalls, 0);
    assert.strictEqual(pickupTarget, dropped);
  });

  it("moves to dropped energy when pickup returns ERR_NOT_IN_RANGE", () => {
    const dropped = { id: "drop1", resourceType: (global as any).RESOURCE_ENERGY, amount: 75 };
    let moveTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 50 },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          if (findConstant === (global as any).FIND_STRUCTURES) return null;
          if (findConstant === (global as any).FIND_DROPPED_RESOURCES) return dropped;
          return null;
        }
      },
      withdraw: (): number => 0,
      pickup: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    const done = runForageTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(moveTarget, dropped);
  });

  it("returns true (complete) when no container energy and no dropped energy are available", () => {
    let withdrawCalls = 0;
    let pickupCalls = 0;

    const creep = {
      store: { getFreeCapacity: (): number => 50 },
      pos: {
        findClosestByRange: (): null => null
      },
      withdraw: (): number => {
        withdrawCalls++;
        return 0;
      },
      pickup: (): number => {
        pickupCalls++;
        return 0;
      },
      moveTo: (): number => 0
    };

    assert.isTrue(runForageTask(creep as any));
    assert.equal(withdrawCalls, 0);
    assert.equal(pickupCalls, 0);
  });
});
