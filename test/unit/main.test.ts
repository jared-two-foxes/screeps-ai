import { assert } from "chai";
import { loop } from "../../src/main";
import { Game, Memory } from "./mock";

describe("main", () => {
  let consoleLogs: string[] = [];
  let originalConsoleLog: (...data: any[]) => void = console.log;

  const createUpgraderCreep = (overrides: any = {}): any => ({
    memory: { role: "upgrader", ...(overrides.memory ?? {}) },
    room: { controller: { id: "controller1" }, storage: undefined, find: (): object[] => [{}], ...(overrides.room ?? {}) },
    store: {
      getUsedCapacity: (): number => 10,
      getFreeCapacity: (): number => 0,
      ...(overrides.store ?? {})
    },
    pos: {
      findClosestByRange: (): object | null => null,
      getRangeTo: (): number => 0,
      ...(overrides.pos ?? {})
    },
    withdraw: (): number => 0,
    harvest: (): number => 0,
    upgradeController: (): number => 0,
    moveTo: (): number => 0,
    ...overrides
  });

  const createHarvesterCreep = (overrides: any = {}): any => ({
    memory: { role: "harvester", ...(overrides.memory ?? {}) },
    room: { storage: undefined, find: (): object[] => [{}], ...(overrides.room ?? {}) },
    store: {
      getUsedCapacity: (): number => 0,
      getFreeCapacity: (): number => 10,
      ...(overrides.store ?? {})
    },
    pos: {
      findClosestByRange: (): object | null => null,
      getRangeTo: (): number => 0,
      ...(overrides.pos ?? {})
    },
    harvest: (): number => 0,
    moveTo: (): number => 0,
    transfer: (): number => 0,
    ...overrides
  });

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
    (global as any).FIND_SOURCES_ACTIVE = 3;
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
    (global as any).OK = 0;
    (global as any).FIND_STRUCTURES = 2;
    (global as any).STRUCTURE_CONTAINER = "container";

    consoleLogs = [];
    originalConsoleLog = console.log;
    console.log = (...data: any[]): void => {
      consoleLogs.push(data.map(value => String(value)).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    const wrappedExceptionLogs = consoleLogs.filter(log => log.includes("<span style='color:red'>"));
    assert.equal(
      wrappedExceptionLogs.length,
      0,
      `unexpected wrapped exception logged from loop(): ${wrappedExceptionLogs.join("\n")}`
    );
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

    (global as any).Game.creeps.persistValue = createUpgraderCreep();

    loop();

    assert.isDefined((global as any).Memory.creeps.persistValue);
    assert.isUndefined((global as any).Memory.creeps.notPersistValue);
  });

  it("invokes spawning from the main loop", () => {
    let spawnCalls = 0;
    (global as any).Game.spawns = {
      Spawn1: {
        room: {
          name: "W1N1",
          energyCapacityAvailable: 300,
          find: (): object[] => []
        },
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
    const upgraderCreep = createUpgraderCreep();
    const harvesterCreep = createHarvesterCreep({
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
      }
    });

    (global as any).Game.spawns = {};
    (global as any).Game.creeps = {
      Harvester1: harvesterCreep,
      Upgrader1: upgraderCreep
    };

    loop();

    assert.equal(harvestCalls, 1);
  });

  it("dispatches creeps with role upgrader to upgrader behavior", () => {
    let upgradeCalls = 0;
    const upgraderCreep = createUpgraderCreep({
      upgradeController: (): number => {
        upgradeCalls++;
        return 0;
      }
    });

    (global as any).Game.spawns = {};
    (global as any).Game.creeps = {
      Upgrader1: upgraderCreep,
      Harvester1: createHarvesterCreep({
        store: {
          getUsedCapacity: (): number => 10,
          getFreeCapacity: (): number => 0
        }
      })
    };

    loop();

    assert.equal(upgradeCalls, 1);
  });

  it("cleans memory and dispatches roles without wrapped exceptions", () => {
    let harvestCalls = 0;
    let upgradeCalls = 0;
    const source = {};

    (global as any).Memory.creeps.harvester1 = "old harvester memory";
    (global as any).Memory.creeps.upgrader1 = "old upgrader memory";
    (global as any).Memory.creeps.missing = "stale memory";

    (global as any).Game.spawns = {};
    (global as any).Game.creeps = {
      harvester1: createHarvesterCreep({
        pos: {
          findClosestByRange: (findConstant: number): object | null =>
            findConstant === (global as any).FIND_SOURCES ? source : null
        },
        harvest: (): number => {
          harvestCalls++;
          return 0;
        }
      }),
      upgrader1: createUpgraderCreep({
        upgradeController: (): number => {
          upgradeCalls++;
          return 0;
        }
      })
    };

    loop();

    assert.isUndefined((global as any).Memory.creeps.missing);
    assert.equal(harvestCalls, 1);
    assert.equal(upgradeCalls, 1);
    assert.isTrue(consoleLogs.every(log => !log.includes("<span style='color:red'>")));
  });
});
