import { assert } from "chai";
import { runSpawner } from "../../src/spawner";
import { Game, Memory } from "./mock";

interface SpawnCall {
  body: BodyPartConstant[];
  name: string;
  memory: CreepMemory | undefined;
}

interface MockSpawn {
  room: {
    name: string;
  };
  spawning: object | null;
  calls: SpawnCall[];
  spawnCreep: (body: BodyPartConstant[], name: string, options: SpawnOptions) => number;
}

const createMockSpawn = (roomName: string, spawning: object | null, returnCode: number): MockSpawn => {
  const calls: SpawnCall[] = [];
  return {
    room: { name: roomName },
    spawning,
    calls,
    spawnCreep: (body: BodyPartConstant[], name: string, options: SpawnOptions): number => {
      calls.push({
        body,
        name,
        memory: options.memory
      });
      return returnCode;
    }
  };
};

describe("spawner", () => {
  beforeEach(() => {
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);
  });

  it("spawns a harvester when below threshold", () => {
    const spawn = createMockSpawn("W1N1", null, 0);
    (global as any).Game.spawns = { Spawn1: spawn };
    (global as any).Game.time = 12345;

    runSpawner();

    assert.equal(spawn.calls.length, 1);
    const firstCall = spawn.calls[0];
    if (firstCall == null) {
      assert.fail("Expected first spawn call to exist");
    }
    assert.deepEqual(firstCall.body, ["work", "carry", "move"]);
    assert.equal(firstCall.name, "Harvester_12345");
    const creepMemory = firstCall.memory;
    if (creepMemory == null) {
      assert.fail("Expected creep memory to exist");
    }
    assert.equal(creepMemory.role, "harvester");
    assert.equal(creepMemory.room, "W1N1");
    assert.isFalse(creepMemory.working);
  });

  it("does not spawn when harvester threshold is met", () => {
    const spawn = createMockSpawn("W1N1", null, 0);
    (global as any).Game.spawns = { Spawn1: spawn };
    (global as any).Game.creeps = {
      Harvester1: { memory: { role: "harvester" } },
      Harvester2: { memory: { role: "harvester" } }
    };

    runSpawner();

    assert.equal(spawn.calls.length, 0);
  });

  it("skips busy spawns", () => {
    const busySpawn = createMockSpawn("W1N1", {}, 0);
    const idleSpawn = createMockSpawn("W1N1", null, 0);
    (global as any).Game.spawns = {
      Busy: busySpawn,
      Idle: idleSpawn
    };
    (global as any).Game.time = 999;

    runSpawner();

    assert.equal(busySpawn.calls.length, 0);
    assert.equal(idleSpawn.calls.length, 1);
    const firstIdleCall = idleSpawn.calls[0];
    if (firstIdleCall == null) {
      assert.fail("Expected idle spawn call to exist");
    }
    assert.equal(firstIdleCall.name, "Harvester_999");
  });

  it("handles spawn failures without crashing", () => {
    const spawn = createMockSpawn("W1N1", null, -6);
    (global as any).Game.spawns = { Spawn1: spawn };

    assert.doesNotThrow(() => runSpawner());
    assert.equal(spawn.calls.length, 1);
  });

  it("does nothing when there are no spawns", () => {
    (global as any).Game.spawns = {};

    assert.doesNotThrow(() => runSpawner());
  });
});
