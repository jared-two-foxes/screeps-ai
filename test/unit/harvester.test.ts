import { assert } from "chai";
import { runHarvester } from "../../src/roles/harvester";
import { Game, Memory } from "./mock";

describe("harvester role", () => {
  beforeEach(() => {
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);

    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  it("with 0 energy transitions to harvesting and targets closest source", () => {
    const source = { id: "source1" };
    let findCalls = 0;
    let harvestTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: true },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          findCalls++;
          assert.equal(findConstant, (global as any).FIND_SOURCES);
          return source;
        }
      },
      harvest: (target: object): number => {
        harvestTarget = target;
        return 0;
      },
      moveTo: (): number => 0,
      transfer: (): number => 0
    };

    runHarvester(creep as any);

    assert.isFalse(creep.memory.working);
    assert.equal(findCalls, 1);
    assert.strictEqual(harvestTarget, source);
  });

  it("calls moveTo(source) when harvest returns ERR_NOT_IN_RANGE", () => {
    const source = { id: "source1" };
    let moveTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: false },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: {
        findClosestByRange: (): object | null => source
      },
      harvest: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      },
      transfer: (): number => 0
    };

    runHarvester(creep as any);

    assert.strictEqual(moveTarget, source);
  });

  it("with 0 free capacity transitions to transferring and targets a spawn when no storage exists", () => {
    const spawn = { id: "spawn1" };
    let findConstantSeen: number | null = null;
    let transferTarget: object | null = null;
    let transferResource: ResourceConstant | null = null;

    const creep = {
      memory: { role: "harvester", working: false },
      room: { storage: undefined },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (findConstant: number): object | null => {
          findConstantSeen = findConstant;
          return spawn;
        }
      },
      harvest: (): number => 0,
      moveTo: (): number => 0,
      transfer: (target: object, resource: ResourceConstant): number => {
        transferTarget = target;
        transferResource = resource;
        return 0;
      }
    };

    runHarvester(creep as any);

    assert.isTrue(creep.memory.working);
    assert.equal(findConstantSeen, (global as any).FIND_MY_SPAWNS);
    assert.strictEqual(transferTarget, spawn);
    assert.equal(transferResource, (global as any).RESOURCE_ENERGY);
  });

  it("calls moveTo(spawn) when transfer to spawn returns ERR_NOT_IN_RANGE", () => {
    const spawn = { id: "spawn1" };
    let moveTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: true },
      room: { storage: undefined },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => spawn
      },
      harvest: (): number => 0,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      },
      transfer: (): number => (global as any).ERR_NOT_IN_RANGE
    };

    runHarvester(creep as any);

    assert.strictEqual(moveTarget, spawn);
  });

  it("chooses storage when storage is closer than spawn", () => {
    const storage = { id: "storage1", store: { getFreeCapacity: (): number => 500 } };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;
    let transferResource: ResourceConstant | null = null;

    const creep = {
      memory: { role: "harvester", working: false },
      room: { storage },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => spawn,
        getRangeTo: (target: { id: string }): number => (target.id === "storage1" ? 2 : 5)
      },
      harvest: (): number => 0,
      moveTo: (): number => 0,
      transfer: (target: object, resource: ResourceConstant): number => {
        transferTarget = target;
        transferResource = resource;
        return 0;
      }
    };

    runHarvester(creep as any);

    assert.strictEqual(transferTarget, storage);
    assert.equal(transferResource, (global as any).RESOURCE_ENERGY);
  });

  it("chooses spawn when spawn is closer than storage", () => {
    const storage = { id: "storage1", store: { getFreeCapacity: (): number => 500 } };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: true },
      room: { storage },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => spawn,
        getRangeTo: (target: { id: string }): number => (target.id === "spawn1" ? 1 : 4)
      },
      harvest: (): number => 0,
      moveTo: (): number => 0,
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      }
    };

    runHarvester(creep as any);

    assert.strictEqual(transferTarget, spawn);
  });

  it("defaults safely when storage and spawn are at equal range", () => {
    const storage = { id: "storage1", store: { getFreeCapacity: (): number => 500 } };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: true },
      room: { storage },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => spawn,
        getRangeTo: (): number => 3
      },
      harvest: (): number => 0,
      moveTo: (): number => 0,
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      }
    };

    assert.doesNotThrow(() => runHarvester(creep as any));
    assert.strictEqual(transferTarget, storage);
  });

  it("calls moveTo(storage) when transfer to storage returns ERR_NOT_IN_RANGE", () => {
    const storage = { id: "storage1", store: { getFreeCapacity: (): number => 500 } };
    let moveTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: true },
      room: { storage },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => null
      },
      harvest: (): number => 0,
      moveTo: (target: object): number => {
        moveTarget = target;
        return 0;
      },
      transfer: (): number => (global as any).ERR_NOT_IN_RANGE
    };

    runHarvester(creep as any);

    assert.strictEqual(moveTarget, storage);
  });

  it("falls back to spawn when storage is full", () => {
    const storage = { id: "storage1", store: { getFreeCapacity: (): number => 0 } };
    const spawn = { id: "spawn1" };
    let transferTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: true },
      room: { storage },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => spawn
      },
      harvest: (): number => 0,
      moveTo: (): number => 0,
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      }
    };

    runHarvester(creep as any);

    assert.strictEqual(transferTarget, spawn);
  });

  it("falls back to storage when no spawns exist", () => {
    const storage = { id: "storage1", store: { getFreeCapacity: (): number => 500 } };
    let transferTarget: object | null = null;

    const creep = {
      memory: { role: "harvester", working: true },
      room: { storage },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => null
      },
      harvest: (): number => 0,
      moveTo: (): number => 0,
      transfer: (target: object): number => {
        transferTarget = target;
        return 0;
      }
    };

    runHarvester(creep as any);

    assert.strictEqual(transferTarget, storage);
  });

  it("idles gracefully when no sources exist", () => {
    let harvestCalls = 0;
    let moveCalls = 0;

    const creep = {
      memory: { role: "harvester", working: false },
      store: {
        getUsedCapacity: (): number => 0,
        getFreeCapacity: (): number => 10
      },
      pos: {
        findClosestByRange: (): object | null => null
      },
      harvest: (): number => {
        harvestCalls++;
        return 0;
      },
      moveTo: (): number => {
        moveCalls++;
        return 0;
      },
      transfer: (): number => 0
    };

    assert.doesNotThrow(() => runHarvester(creep as any));
    assert.equal(harvestCalls, 0);
    assert.equal(moveCalls, 0);
  });

  it("idles gracefully when no spawns exist", () => {
    let transferCalls = 0;
    let moveCalls = 0;

    const creep = {
      memory: { role: "harvester", working: true },
      room: { storage: undefined },
      store: {
        getUsedCapacity: (): number => 10,
        getFreeCapacity: (): number => 0
      },
      pos: {
        findClosestByRange: (): object | null => null
      },
      harvest: (): number => 0,
      moveTo: (): number => {
        moveCalls++;
        return 0;
      },
      transfer: (): number => {
        transferCalls++;
        return 0;
      }
    };

    assert.doesNotThrow(() => runHarvester(creep as any));
    assert.equal(transferCalls, 0);
    assert.equal(moveCalls, 0);
  });
});
