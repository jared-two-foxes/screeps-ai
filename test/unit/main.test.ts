import { assert } from "chai";
import { loop } from "../../src/main";
import { Game, Memory } from "./mock";

describe("main", () => {
  before(() => {
    // runs before all test in this block
  });

  beforeEach(() => {
    // runs before each test in this block
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  it("should export a loop function", () => {
    assert.isTrue(typeof loop === "function");
  });

  it("should return void when called with no context", () => {
    assert.isUndefined(loop());
  });

  it("Automatically delete memory of missing creeps", () => {
    (global as any).Memory.creeps.persistValue = "any value";
    (global as any).Memory.creeps.notPersistValue = "any value";

    (global as any).Game.creeps.persistValue = { memory: { role: "upgrader" } };

    loop();

    assert.isDefined((global as any).Memory.creeps.persistValue);
    assert.isUndefined((global as any).Memory.creeps.notPersistValue);
  });

  it("invokes spawning from the main loop", () => {
    let spawnCalls = 0;
    (global as any).Game.spawns = {
      Spawn1: {
        room: { name: "W1N1" },
        spawning: null,
        spawnCreep: (): number => {
          spawnCalls++;
          return 0;
        }
      }
    };
    (global as any).Game.creeps = {};

    loop();

    assert.equal(spawnCalls, 1);
  });

  it("executes harvester logic only for creeps with the harvester role", () => {
    let harvestCalls = 0;
    const source = {};
    const harvesterCreep = {
      memory: { role: "harvester", working: false },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          if (findConstant === (global as any).FIND_SOURCES) {
            return source;
          }
          return null;
        }
      },
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      moveTo: (): number => 0,
      transfer: (): number => 0
    };

    (global as any).Game.spawns = {};
    (global as any).Game.creeps = {
      Harvester1: harvesterCreep,
      Upgrader1: { memory: { role: "upgrader" } }
    };

    loop();

    assert.equal(harvestCalls, 1);
  });
});
