import { assert } from "chai";
import { runRepairTask } from "../../src/tasks/repair";
import { Game, Memory } from "./mock";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCtx = (allocations: Record<string, number> = {}): TickContext => ({
  slots: {
    taskCounts: {},
    economyTarget: 1,
    hasBuildSites: false,
    hasActiveStationaryUpgrader: false,
    hasRepairTargets: true
  },
  repairAllocations: allocations,
  sourceContainerMap: {}
});

const makeStructure = (id: string, hits: number, hitsMax: number): any => ({
  id,
  hits,
  hitsMax,
  pos: {}
});

const makeCreep = (energyCarried: number, repairTargetId?: string): any => ({
  memory: { repairTargetId },
  store: { getUsedCapacity: (): number => energyCarried },
  room: { find: (): any[] => [] },
  repair: (): number => 0,
  moveTo: (): number => 0,
  pos: {}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runRepairTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_STRUCTURES = 4;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).ERR_NOT_IN_RANGE = -9;
  });

  // -------------------------------------------------------------------------
  // Energy guard
  // -------------------------------------------------------------------------

  it("returns true and clears repairTargetId when creep has no energy", () => {
    const creep = makeCreep(0, "struct1");
    const ctx = makeCtx();
    const done = runRepairTask(creep, ctx);
    assert.isTrue(done);
    assert.isUndefined(creep.memory.repairTargetId);
  });

  // -------------------------------------------------------------------------
  // No candidates
  // -------------------------------------------------------------------------

  it("returns true when no structures need repair", () => {
    const creep = {
      ...makeCreep(10),
      room: { find: (): any[] => [] }
    };
    const ctx = makeCtx();
    const done = runRepairTask(creep, ctx);
    assert.isTrue(done);
  });

  // -------------------------------------------------------------------------
  // Target selection — unclaimed preferred over claimed
  // -------------------------------------------------------------------------

  it("picks unclaimed structure over claimed one", () => {
    const claimed = makeStructure("claimed1", 500, 1000);
    const unclaimed = makeStructure("unclaimed1", 600, 1000);

    const creep = {
      ...makeCreep(10),
      room: {
        find: (): any[] => [claimed, unclaimed]
      },
      repair: (): number => 0
    };

    // claimed1 already has one repairer
    const ctx = makeCtx({ claimed1: 1 });

    (global as any).Game.getObjectById = (): null => null;

    runRepairTask(creep, ctx);

    assert.equal(creep.memory.repairTargetId, "unclaimed1");
    assert.equal(ctx.repairAllocations["unclaimed1"], 1);
  });

  it("falls back to claimed structure when all candidates are claimed", () => {
    const s1 = makeStructure("s1", 400, 1000);
    const s2 = makeStructure("s2", 600, 1000);

    const creep = {
      ...makeCreep(10),
      room: { find: (): any[] => [s1, s2] },
      repair: (): number => 0
    };

    const ctx = makeCtx({ s1: 1, s2: 1 });
    (global as any).Game.getObjectById = (): null => null;

    runRepairTask(creep, ctx);

    // s1 is more critical (lower ratio), should be picked
    assert.equal(creep.memory.repairTargetId, "s1");
  });

  // -------------------------------------------------------------------------
  // Criticality ordering
  // -------------------------------------------------------------------------

  it("picks the most critically damaged unclaimed structure first", () => {
    const critical = makeStructure("critical", 100, 1000);   // 10% hits
    const moderate = makeStructure("moderate", 500, 1000);   // 50% hits

    const creep = {
      ...makeCreep(10),
      room: { find: (): any[] => [moderate, critical] },
      repair: (): number => 0
    };

    const ctx = makeCtx();
    (global as any).Game.getObjectById = (): null => null;

    runRepairTask(creep, ctx);

    assert.equal(creep.memory.repairTargetId, "critical");
  });

  // -------------------------------------------------------------------------
  // Cached target reuse
  // -------------------------------------------------------------------------

  it("reuses cached repairTargetId when target is still damaged", () => {
    const struct = makeStructure("cached1", 500, 1000);
    let repairCalls = 0;

    const creep = {
      ...makeCreep(10, "cached1"),
      room: { find: (): any[] => [struct] },
      repair: (): number => { repairCalls++; return 0; }
    };

    (global as any).Game.getObjectById = (id: string): any =>
      id === "cached1" ? struct : null;

    const ctx = makeCtx();
    const done = runRepairTask(creep, ctx);

    assert.isFalse(done);
    assert.equal(repairCalls, 1);
    assert.equal(creep.memory.repairTargetId, "cached1");
  });

  // -------------------------------------------------------------------------
  // Fully-repaired target cycling
  // -------------------------------------------------------------------------

  it("clears repairTargetId and picks next target when cached target is fully repaired", () => {
    const full = makeStructure("full1", 1000, 1000);   // at hitsMax
    const next = makeStructure("next1", 500, 1000);

    const creep = {
      ...makeCreep(10, "full1"),
      room: { find: (): any[] => [next] },
      repair: (): number => 0
    };

    (global as any).Game.getObjectById = (id: string): any => {
      if (id === "full1") return full;
      return null;
    };

    const ctx = makeCtx();
    runRepairTask(creep, ctx);

    assert.equal(creep.memory.repairTargetId, "next1");
  });

  // -------------------------------------------------------------------------
  // moveTo when out of range
  // -------------------------------------------------------------------------

  it("calls moveTo when repair returns ERR_NOT_IN_RANGE", () => {
    const struct = makeStructure("far1", 500, 1000);
    let moveCalls = 0;

    const creep = {
      ...makeCreep(10),
      room: { find: (): any[] => [struct] },
      repair: (): number => (global as any).ERR_NOT_IN_RANGE,
      moveTo: (): number => { moveCalls++; return 0; }
    };

    (global as any).Game.getObjectById = (): null => null;

    const ctx = makeCtx();
    const done = runRepairTask(creep, ctx);

    assert.isFalse(done);
    assert.equal(moveCalls, 1);
  });

  // -------------------------------------------------------------------------
  // repairAllocations mutation
  // -------------------------------------------------------------------------

  it("increments repairAllocations for the newly selected target", () => {
    const struct = makeStructure("alloc1", 300, 1000);

    const creep = {
      ...makeCreep(10),
      room: { find: (): any[] => [struct] },
      repair: (): number => 0
    };

    (global as any).Game.getObjectById = (): null => null;

    const ctx = makeCtx();
    runRepairTask(creep, ctx);

    assert.equal(ctx.repairAllocations["alloc1"], 1);
  });

  it("does not double-increment repairAllocations when reusing a cached target", () => {
    const struct = makeStructure("cached2", 500, 1000);

    const creep = {
      ...makeCreep(10, "cached2"),
      room: { find: (): any[] => [struct] },
      repair: (): number => 0
    };

    (global as any).Game.getObjectById = (id: string): any =>
      id === "cached2" ? struct : null;

    // Simulate that main.ts already counted this creep's existing allocation
    const ctx = makeCtx({ cached2: 1 });
    runRepairTask(creep, ctx);

    // Should still be 1 — no new allocation added for a reused target
    assert.equal(ctx.repairAllocations["cached2"], 1);
  });
});
