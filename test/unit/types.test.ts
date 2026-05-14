import { assert } from "chai";

// Type-level regression checks for Screeps memory typing.
// These assertions intentionally rely on TypeScript compile-time behavior.
const upgraderMemoryWithoutWorking: CreepMemory = {
  role: "upgrader",
  room: "W1N1"
};

const stationaryHarvesterMemory: CreepMemory = {
  role: "stationaryHarvester",
  room: "W1N1",
  task: "harvestAndDeposit"
};

const haulerMemory: CreepMemory = {
  role: "hauler",
  room: "W1N1",
  task: "forage"
};

const builderMemory: CreepMemory = {
  role: "builder",
  room: "W1N1",
  task: "build"
};

const validUpgraderRole: CreepMemory["role"] = "upgrader";
const validStationaryHarvesterRole: CreepMemory["role"] = "stationaryHarvester";
const validHaulerRole: CreepMemory["role"] = "hauler";
const validBuilderRole: CreepMemory["role"] = "builder";

const validHarvestAndDepositTask: TaskType = "harvestAndDeposit";
const validForageTask: TaskType = "forage";
const validBuildTask: TaskType = "build";

// @ts-expect-error CreepMemory.role should reject unsupported roles once narrowed.
const invalidRole: CreepMemory["role"] = "scout";

// @ts-expect-error TaskType should reject unsupported tasks once narrowed.
const invalidTask: TaskType = "repair";

describe("types", () => {
  it("accepts valid upgrader creep memory with only required fields", () => {
    assert.equal(upgraderMemoryWithoutWorking.role, validUpgraderRole);
  });

  it("accepts stationaryHarvester, hauler, and builder roles", () => {
    assert.deepEqual(
      [stationaryHarvesterMemory.role, haulerMemory.role, builderMemory.role],
      [validStationaryHarvesterRole, validHaulerRole, validBuilderRole]
    );
  });

  it("accepts harvestAndDeposit, forage, and build task types", () => {
    assert.deepEqual(
      [stationaryHarvesterMemory.task, haulerMemory.task, builderMemory.task],
      [validHarvestAndDepositTask, validForageTask, validBuildTask]
    );
  });

  it("keeps compile-time guard for invalid roles", () => {
    assert.equal(typeof invalidRole, "string");
  });

  it("keeps compile-time guard for invalid tasks", () => {
    assert.equal(typeof invalidTask, "string");
  });
});
