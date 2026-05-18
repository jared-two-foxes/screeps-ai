import { assert } from "chai";

// After U2 this must compile; before U2 it causes a TS error → tests in this file fail.
// "upgradeFromContainer" is not in the current TaskType union → compile error.
const validUpgradeFromContainerTask: TaskType = "upgradeFromContainer";

// CreepMemory no longer has `role` — only room, task, sourceId remain.
// Before U2, `role` is required → this line causes a compile error.
const minimalCreepMemory: CreepMemory = {
  room: "W1N1"
};

const creepMemoryWithTask: CreepMemory = {
  room: "W1N1",
  task: "upgradeFromContainer"
};

// @ts-expect-error TaskType should still reject unsupported tasks
const invalidTask: TaskType = "repair";

describe("types", () => {
  it("accepts minimal CreepMemory with only room field", () => {
    assert.equal(minimalCreepMemory.room, "W1N1");
  });

  it("accepts upgradeFromContainer as a valid TaskType", () => {
    assert.equal(validUpgradeFromContainerTask, "upgradeFromContainer");
  });

  it("accepts CreepMemory with upgradeFromContainer task", () => {
    assert.equal(creepMemoryWithTask.task, "upgradeFromContainer");
  });

  it("keeps compile-time guard for invalid tasks", () => {
    assert.equal(typeof invalidTask, "string");
  });
});
