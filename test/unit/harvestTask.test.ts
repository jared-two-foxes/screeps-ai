import { assert } from "chai";
import { runHarvestTask } from "../../src/tasks/harvest";
import { Game, Memory } from "./mock";

const makeCtx = (sourceContainerMap: Record<string, any> = {}): any => ({
  slots: { taskCounts: {}, economyTarget: 1, hasBuildSites: false, hasActiveStationaryUpgrader: false, hasRepairTargets: false },
  repairAllocations: {},
  sourceContainerMap
});

describe("runHarvestTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES = 1;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
    (global as any).OK = 0;
    (global as any).ERR_FULL = -8;
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

    const done = runHarvestTask(creep as any, makeCtx());

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

    const done = runHarvestTask(creep as any, makeCtx());

    assert.isFalse(done);
    assert.strictEqual(moveTarget, source);
  });

  it("returns true (complete) when store is full and no container info", () => {
    const creep = {
      store: { getFreeCapacity: (): number => 0 },
      memory: { sourceId: "source1" },
      pos: { findClosestByRange: (): object | null => ({ id: "source1" }) },
      harvest: (): number => 0,
      moveTo: (): number => 0
    };

    assert.isTrue(runHarvestTask(creep as any, makeCtx()));
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

    assert.isTrue(runHarvestTask(creep as any, makeCtx()));
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

    runHarvestTask(creep as any, makeCtx());

    assert.equal(moveCalls, 0);
  });

  // -------------------------------------------------------------------------
  // Pseudo-static harvesting (container present)
  // -------------------------------------------------------------------------

  describe("pseudo-static harvesting (container present)", () => {
    it("store full, container in range → calls transfer, returns false", () => {
      const container = { id: "cont1", pos: { x: 6, y: 5 } };
      (global as any).Game.getObjectById = (id: string): any => id === "cont1" ? container : null;

      let transferred = false;
      const creep = {
        store: { getFreeCapacity: (): number => 0 },
        memory: { sourceId: "src1" },
        transfer: (target: any, _resource: string): number => {
          transferred = target === container;
          return (global as any).OK;
        },
        drop: (): number => 0,
        moveTo: (): number => 0
      };

      const ctx = makeCtx({ src1: { containerId: "cont1", harvestDepositTileCount: 2 } });
      const done = runHarvestTask(creep as any, ctx);

      assert.isFalse(done, "should return false (stay in harvest task)");
      assert.isTrue(transferred, "should call transfer on the container");
    });

    it("store full, container out of range → calls moveTo container, returns false", () => {
      const container = { id: "cont1", pos: { x: 6, y: 5 } };
      (global as any).Game.getObjectById = (id: string): any => id === "cont1" ? container : null;

      let moveTarget: any = null;
      const creep = {
        store: { getFreeCapacity: (): number => 0 },
        memory: { sourceId: "src1" },
        transfer: (): number => (global as any).ERR_NOT_IN_RANGE,
        drop: (): number => 0,
        moveTo: (target: any): number => {
          moveTarget = target;
          return 0;
        }
      };

      const ctx = makeCtx({ src1: { containerId: "cont1", harvestDepositTileCount: 2 } });
      const done = runHarvestTask(creep as any, ctx);

      assert.isFalse(done, "should return false (stay in harvest task)");
      assert.strictEqual(moveTarget, container, "should moveTo the container");
    });

    it("store full, container returns ERR_FULL → calls drop, returns false", () => {
      const container = { id: "cont1", pos: { x: 6, y: 5 } };
      (global as any).Game.getObjectById = (id: string): any => id === "cont1" ? container : null;

      let dropped = false;
      const creep = {
        store: { getFreeCapacity: (): number => 0 },
        memory: { sourceId: "src1" },
        transfer: (): number => (global as any).ERR_FULL,
        drop: (): number => {
          dropped = true;
          return 0;
        },
        moveTo: (): number => 0
      };

      const ctx = makeCtx({ src1: { containerId: "cont1", harvestDepositTileCount: 2 } });
      const done = runHarvestTask(creep as any, ctx);

      assert.isFalse(done, "should return false (stay in harvest task)");
      assert.isTrue(dropped, "should drop energy when container is full");
    });

    it("store full, source not in sourceContainerMap → returns true (original behaviour)", () => {
      const creep = {
        store: { getFreeCapacity: (): number => 0 },
        memory: { sourceId: "src-no-container" },
        harvest: (): number => 0,
        moveTo: (): number => 0
      };

      const ctx = makeCtx({}); // empty map
      assert.isTrue(runHarvestTask(creep as any, ctx), "should return true when no container info");
    });

    it("store not full, source in sourceContainerMap → harvests normally, returns false", () => {
      const source = { id: "src1" };
      (global as any).Game.getObjectById = (id: string): any => id === "src1" ? source : null;

      let harvestCalled = false;
      const creep = {
        store: { getFreeCapacity: (): number => 10 },
        memory: { sourceId: "src1" },
        pos: { findClosestByRange: (): any => source },
        harvest: (target: any): number => {
          harvestCalled = target === source;
          return (global as any).OK;
        },
        moveTo: (): number => 0
      };

      const ctx = makeCtx({ src1: { containerId: "cont1", harvestDepositTileCount: 2 } });
      const done = runHarvestTask(creep as any, ctx);

      assert.isFalse(done, "should return false (still harvesting)");
      assert.isTrue(harvestCalled, "should call harvest on the source");
    });
  });
});

