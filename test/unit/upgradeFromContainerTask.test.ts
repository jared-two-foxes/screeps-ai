import { assert } from "chai";
import { runUpgradeFromContainerTask } from "../../src/tasks/upgradeFromContainer";

// sinon is injected by test/setup-mocha.js; declare here for TypeScript module context.
declare var sinon: any;

describe("runUpgradeFromContainerTask", () => {
  beforeEach(() => {
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
    (global as any).FIND_STRUCTURES = 2;
    (global as any).STRUCTURE_CONTAINER = "container";
  });

  const makeContainer = (energy = 50): any => ({
    store: { getUsedCapacity: (): number => energy },
    structureType: "container"
  });

  const makeCreep = (opts: {
    energyCarried?: number;
    energyFree?: number;
    containersAtRange1?: any[];
    containersAtRange3?: any[];
    upgradeResult?: number;
    withdrawResult?: number;
  }): any => {
    const {
      energyCarried = 0,
      energyFree = 50,
      containersAtRange1 = [],
      containersAtRange3 = [],
      upgradeResult = 0,
      withdrawResult = 0
    } = opts;

    const controller = { pos: { x: 20, y: 20 } };

    const upgradeController = sinon.spy(() => upgradeResult);
    const withdraw = sinon.spy(() => withdrawResult);
    const moveTo = sinon.spy(() => 0);

    return {
      store: {
        getUsedCapacity: (): number => energyCarried,
        getFreeCapacity: (): number => energyFree
      },
      room: { controller },
      pos: {
        findInRange: (constant: number, range: number): any[] => {
          if (constant === (global as any).FIND_STRUCTURES) {
            if (range === 1) return containersAtRange1;
            if (range === 3) return containersAtRange3;
          }
          return [];
        }
      },
      upgradeController,
      withdraw,
      moveTo
    };
  };

  describe("never returns true", () => {
    it("returns false when store is empty and container is in range", () => {
      const container = makeContainer(50);
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [container] });
      const result = runUpgradeFromContainerTask(creep);
      assert.isFalse(result);
    });

    it("returns false when store has energy", () => {
      const creep = makeCreep({ energyCarried: 25 });
      const result = runUpgradeFromContainerTask(creep);
      assert.isFalse(result);
    });
  });

  describe("has energy → upgradeController", () => {
    it("calls upgradeController when energyCarried > 0 and returns false", () => {
      const creep = makeCreep({ energyCarried: 25, upgradeResult: 0 });
      const result = runUpgradeFromContainerTask(creep);
      assert.isTrue(creep.upgradeController.calledOnce);
      assert.isTrue(creep.upgradeController.calledWith(creep.room.controller));
      assert.isFalse(result);
    });

    it("calls moveTo controller when upgradeController returns ERR_NOT_IN_RANGE", () => {
      const creep = makeCreep({ energyCarried: 25, upgradeResult: -9 });
      runUpgradeFromContainerTask(creep);
      assert.isTrue(creep.moveTo.calledOnce);
      assert.isTrue(creep.moveTo.calledWith(creep.room.controller));
    });
  });

  describe("store empty → withdraw from adjacent container", () => {
    it("withdraws from container at range 1 when energyCarried === 0", () => {
      const container = makeContainer(50);
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [container] });
      runUpgradeFromContainerTask(creep);
      assert.isTrue(creep.withdraw.calledOnce);
      assert.isTrue(creep.withdraw.calledWith(container, (global as any).RESOURCE_ENERGY));
    });

    it("returns false when withdrawing from range 1 container", () => {
      const container = makeContainer(50);
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [container] });
      const result = runUpgradeFromContainerTask(creep);
      assert.isFalse(result);
    });

    it("tries range 3 withdraw when no container at range 1 but one at range 3", () => {
      const container = makeContainer(50);
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [], containersAtRange3: [container] });
      runUpgradeFromContainerTask(creep);
      assert.isTrue(creep.withdraw.calledOnce);
      assert.isTrue(creep.withdraw.calledWith(container, (global as any).RESOURCE_ENERGY));
    });

    it("returns false when withdrawing from range 3 container", () => {
      const container = makeContainer(50);
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [], containersAtRange3: [container] });
      const result = runUpgradeFromContainerTask(creep);
      assert.isFalse(result);
    });

    it("calls moveTo toward controller area when no container in range 3", () => {
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [], containersAtRange3: [] });
      runUpgradeFromContainerTask(creep);
      assert.isTrue(creep.moveTo.calledOnce);
    });

    it("returns false when no container in range 3", () => {
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [], containersAtRange3: [] });
      const result = runUpgradeFromContainerTask(creep);
      assert.isFalse(result);
    });

    it("calls moveTo(container) when withdraw returns ERR_NOT_IN_RANGE", () => {
      const container = makeContainer(50);
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [container], withdrawResult: -9 });
      runUpgradeFromContainerTask(creep);
      assert.isTrue(creep.moveTo.calledOnce);
      assert.isTrue(creep.moveTo.calledWith(container));
    });

    it("returns false when withdraw returns ERR_NOT_IN_RANGE", () => {
      const container = makeContainer(50);
      const creep = makeCreep({ energyCarried: 0, containersAtRange1: [container], withdrawResult: -9 });
      const result = runUpgradeFromContainerTask(creep);
      assert.isFalse(result);
    });
  });
});
