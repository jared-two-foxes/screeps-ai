import { assert } from "chai";
import { runUpgradeTask } from "../../src/tasks/upgrade";
import { Game, Memory } from "./mock";

describe("runUpgradeTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  it("returns false and upgrades the controller when creep has energy", () => {
    const controller = { id: "controller1" };
    let upgradeTarget: object | null = null;

    const creep = {
      memory: {},
      store: { getUsedCapacity: (): number => 10 },
      room: { controller },
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
      memory: {},
      store: { getUsedCapacity: (): number => 10 },
      room: { controller },
      upgradeController: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      }
    };

    runUpgradeTask(creep as any);

    assert.strictEqual(moveTarget, controller);
  });

  it("returns true and clears obtainedFromId when creep store is empty", () => {
    const creep = {
      memory: { obtainedFromId: "some-container" } as any,
      store: { getUsedCapacity: (): number => 0 },
      room: { controller: { id: "c1" } },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    const done = runUpgradeTask(creep as any);

    assert.isTrue(done);
    assert.isUndefined(creep.memory.obtainedFromId);
  });

  it("returns true and clears obtainedFromId when room has no controller", () => {
    const creep = {
      memory: { obtainedFromId: "some-container" } as any,
      store: { getUsedCapacity: (): number => 10 },
      room: { controller: undefined },
      upgradeController: (): number => 0,
      moveTo: (): number => 0
    };

    const done = runUpgradeTask(creep as any);

    assert.isTrue(done);
    assert.isUndefined(creep.memory.obtainedFromId);
  });
});
