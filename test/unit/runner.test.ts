import { assert } from "chai";
import { runTask } from "../../src/tasks/runner";
import { Game, Memory } from "./mock";

// ---------------------------------------------------------------------------
// Minimal creep that records which task-level API calls are made
// ---------------------------------------------------------------------------
const makeCreep = (task: TaskType | undefined, energyCarried: number): any => ({
  memory: { task },
  store: { getUsedCapacity: (): number => energyCarried, getFreeCapacity: (): number => 10 - energyCarried },
  room: { controller: { id: "c1" }, storage: undefined },
  pos: { findClosestByRange: (): null => null },
  harvest: (): number => 0,
  transfer: (): number => 0,
  withdraw: (): number => 0,
  upgradeController: (): number => 0,
  moveTo: (): number => 0
});

describe("runTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_SOURCES_ACTIVE = 3;
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
    (global as any).ERR_FULL = -8;
  });

  // -------------------------------------------------------------------------
  // Dispatch routing
  // -------------------------------------------------------------------------

  it("dispatches 'harvest' task: calls harvest when creep is not full", () => {
    let harvestCalls = 0;
    const source = { id: "source1" };

    const creep = {
      ...makeCreep("harvest", 0),
      store: { getFreeCapacity: (): number => 10 },
      pos: { findClosestByRange: (): object => source },
      harvest: (): number => {
        harvestCalls++;
        return 0;
      }
    };

    const done = runTask(creep as any);

    assert.isFalse(done);
    assert.equal(harvestCalls, 1);
  });

  it("dispatches 'deposit' task: calls transfer when creep has energy and spawn is available", () => {
    let transferCalls = 0;
    const spawn = { id: "spawn1" };

    const creep = {
      ...makeCreep("deposit", 10),
      store: { getUsedCapacity: (): number => 10 },
      room: { storage: undefined },
      pos: {
        findClosestByRange: (): object => spawn,
        getRangeTo: (): number => 1
      },
      transfer: (): number => {
        transferCalls++;
        return 0;
      }
    };

    const done = runTask(creep as any);

    assert.isFalse(done);
    assert.equal(transferCalls, 1);
  });

  it("dispatches 'upgrade' task: calls upgradeController when creep has energy", () => {
    let upgradeCalls = 0;
    const controller = { id: "controller1" };

    const creep = {
      ...makeCreep("upgrade", 10),
      room: { controller, storage: undefined },
      upgradeController: (): number => {
        upgradeCalls++;
        return 0;
      }
    };

    const done = runTask(creep as any);

    assert.isFalse(done);
    assert.equal(upgradeCalls, 1);
  });

  // -------------------------------------------------------------------------
  // Completion pass-through
  // -------------------------------------------------------------------------

  it("returns true for 'harvest' when store is full", () => {
    const creep = {
      ...makeCreep("harvest", 0),
      store: { getFreeCapacity: (): number => 0 }
    };
    assert.isTrue(runTask(creep as any));
  });

  it("returns true for 'deposit' when store is empty", () => {
    const creep = makeCreep("deposit", 0);
    assert.isTrue(runTask(creep as any));
  });

  it("returns true for 'upgrade' when empty and no energy source available", () => {
    const creep = makeCreep("upgrade", 0); // no storage, no active source
    assert.isTrue(runTask(creep as any));
  });

  // -------------------------------------------------------------------------
  // Default / unknown task
  // -------------------------------------------------------------------------

  it("returns true when task is undefined (forces re-evaluation)", () => {
    const creep = makeCreep(undefined, 0);
    assert.isTrue(runTask(creep as any));
  });
});
