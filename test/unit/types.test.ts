import { assert } from "chai";

// Type-level regression checks for Screeps memory typing.
// These assertions intentionally rely on TypeScript compile-time behavior.
const upgraderMemoryWithoutWorking: CreepMemory = {
  role: "upgrader",
  room: "W1N1"
};

const validUpgraderRole: CreepMemory["role"] = "upgrader";

// @ts-expect-error CreepMemory.role should reject unsupported roles once narrowed.
const invalidRole: CreepMemory["role"] = "builder";

describe("types", () => {
  it("accepts valid upgrader creep memory with only required fields", () => {
    assert.equal(upgraderMemoryWithoutWorking.role, validUpgraderRole);
  });

  it("keeps compile-time guard for invalid roles", () => {
    assert.equal(typeof invalidRole, "string");
  });
});
