import { assert } from "chai";
import { runHarvestAndDepositTask } from "../../src/tasks/harvestAndDeposit";
import { Game, Memory } from "./mock";

describe("runHarvestAndDepositTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_STRUCTURES = 2;
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  it("always returns false and moves toward source when not adjacent", () => {
    const source = { id: "source1", pos: { findInRange: (): [] => [] } };
    let moveTarget: object | null = null;
    let harvestTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: {
        findClosestByRange: (): object => source,
        getRangeTo: (): number => 3,
        findInRange: (): [] => []
      },
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      },
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      transfer: (): number => 0,
      drop: (): number => 0
    };

    const done = runHarvestAndDepositTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(moveTarget, source);
    assert.strictEqual(harvestTarget, source);
  });

  it("harvests source when not full", () => {
    const source = { id: "source1", pos: { findInRange: (): [] => [] } };
    let harvestTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: {
        findClosestByRange: (): object => source,
        getRangeTo: (): number => 1,
        findInRange: (): [] => []
      },
      moveTo: (): number => 0,
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      transfer: (): number => 0,
      drop: (): number => 0
    };

    const done = runHarvestAndDepositTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(harvestTarget, source);
  });

  it("moves to source when harvest returns ERR_NOT_IN_RANGE", () => {
    const source = { id: "source1", pos: { findInRange: (): [] => [] } };
    let moveTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: {
        findClosestByRange: (): object => source,
        getRangeTo: (): number => 1,
        findInRange: (): [] => []
      },
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      },
      harvest: (): number => (global as any).ERR_NOT_IN_RANGE,
      transfer: (): number => 0,
      drop: (): number => 0
    };

    const done = runHarvestAndDepositTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(moveTarget, source);
  });

  it("transfers to adjacent container when carry is full", () => {
    const container = { id: "container1", structureType: (global as any).STRUCTURE_CONTAINER };
    const source = { id: "source1", pos: { findInRange: (): object[] => [container] } };
    let transferTarget: object | null = null;
    let transferResource: ResourceConstant | null = null;
    let dropCalls = 0;

    const creep = {
      store: { getFreeCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (): object => source,
        getRangeTo: (): number => 1,
        findInRange: (): object[] => [container]
      },
      moveTo: (): number => 0,
      harvest: (): number => 0,
      transfer: (target: object, resource: ResourceConstant): number => {
        transferTarget = target;
        transferResource = resource;
        return 0;
      },
      drop: (): number => {
        dropCalls++;
        return 0;
      }
    };

    const done = runHarvestAndDepositTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(transferTarget, container);
    assert.equal(transferResource, (global as any).RESOURCE_ENERGY);
    assert.equal(dropCalls, 0);
  });

  it("moves to container when transfer returns ERR_NOT_IN_RANGE", () => {
    const container = { id: "container1", structureType: (global as any).STRUCTURE_CONTAINER };
    const source = { id: "source1", pos: { findInRange: (): object[] => [container] } };
    let moveTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (): object => source,
        getRangeTo: (): number => 1,
        findInRange: (): object[] => [container]
      },
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      },
      harvest: (): number => 0,
      transfer: (): number => (global as any).ERR_NOT_IN_RANGE,
      drop: (): number => 0
    };

    const done = runHarvestAndDepositTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(moveTarget, container);
  });

  it("drops energy when carry is full and no adjacent container exists", () => {
    const source = { id: "source1", pos: { findInRange: (): [] => [] } };
    let dropResource: ResourceConstant | null = null;
    let transferCalls = 0;

    const creep = {
      store: { getFreeCapacity: (): number => 0 },
      pos: {
        findClosestByRange: (): object => source,
        getRangeTo: (): number => 1,
        findInRange: (): [] => []
      },
      moveTo: (): number => 0,
      harvest: (): number => 0,
      transfer: (): number => {
        transferCalls++;
        return 0;
      },
      drop: (resource: ResourceConstant): number => {
        dropResource = resource;
        return 0;
      }
    };

    const done = runHarvestAndDepositTask(creep as any);

    assert.isFalse(done);
    assert.equal(transferCalls, 0);
    assert.equal(dropResource, (global as any).RESOURCE_ENERGY);
  });

  it("returns false when no source can be found (source disappears)", () => {
    let moveCalls = 0;
    let harvestCalls = 0;
    let transferCalls = 0;
    let dropCalls = 0;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: {
        findClosestByRange: (): null => null,
        getRangeTo: (): number => 1,
        findInRange: (): [] => []
      },
      moveTo: (): number => {
        moveCalls++;
        return 0;
      },
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      transfer: (): number => {
        transferCalls++;
        return 0;
      },
      drop: (): number => {
        dropCalls++;
        return 0;
      }
    };

    const done = runHarvestAndDepositTask(creep as any);

    assert.isFalse(done);
    assert.equal(moveCalls, 0);
    assert.equal(harvestCalls, 0);
    assert.equal(transferCalls, 0);
    assert.equal(dropCalls, 0);
  });
});
