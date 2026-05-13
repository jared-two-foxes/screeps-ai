import { assert } from "chai";
import { runHarvestTask } from "../../src/tasks/harvest";
import { Game, Memory } from "./mock";

describe("runHarvestTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES = 1;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  it("returns false and harvests when store has free capacity and source is in range", () => {
    const source = { id: "source1" };
    let harvestTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: { findClosestByRange: (): object => source },
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      moveTo: (): number => 0
    };

    const done = runHarvestTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(harvestTarget, source);
  });

  it("returns false and moves to source when harvest returns ERR_NOT_IN_RANGE", () => {
    const source = { id: "source1" };
    let moveTarget: object | null = null;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: { findClosestByRange: (): object => source },
      harvest: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    const done = runHarvestTask(creep as any);

    assert.isFalse(done);
    assert.strictEqual(moveTarget, source);
  });

  it("returns true (complete) when store is full", () => {
    const creep = {
      store: { getFreeCapacity: (): number => 0 },
      pos: { findClosestByRange: (): object | null => ({ id: "source1" }) },
      harvest: (): number => 0,
      moveTo: (): number => 0
    };

    assert.isTrue(runHarvestTask(creep as any));
  });

  it("returns true (complete) when no source is found", () => {
    let harvestCalls = 0;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: { findClosestByRange: (): null => null },
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      moveTo: (): number => 0
    };

    assert.isTrue(runHarvestTask(creep as any));
    assert.equal(harvestCalls, 0);
  });

  it("does not call moveTo when harvest succeeds", () => {
    let moveCalls = 0;

    const creep = {
      store: { getFreeCapacity: (): number => 10 },
      pos: { findClosestByRange: (): object => ({ id: "source1" }) },
      harvest: (): number => 0,
      moveTo: (): number => {
        moveCalls++;
        return 0;
      }
    };

    runHarvestTask(creep as any);

    assert.equal(moveCalls, 0);
  });
});
