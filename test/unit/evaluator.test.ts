import { assert } from "chai";
import { evaluateTask } from "../../src/tasks/evaluator";
import { Game, Memory } from "./mock";

// ---------------------------------------------------------------------------
// Minimal creep factory — only the fields evaluateTask touches
// ---------------------------------------------------------------------------
const makeCreep = (opts: {
  energyCarried?: number;
  spawnEnergy?: number;
  spawnCapacity?: number;
  spawnFree?: number;
  storageFree?: number;
  activeSources?: number;
}): any => {
  const {
    energyCarried = 0,
    spawnEnergy = 0,
    spawnCapacity = 300,
    spawnFree = 300,
    storageFree = 0,
    activeSources = 0
  } = opts;

  const spawn =
    spawnCapacity > 0
      ? {
          store: {
            [RESOURCE_ENERGY]: spawnEnergy,
            getCapacity: (): number => spawnCapacity,
            getFreeCapacity: (): number => spawnFree
          }
        }
      : null;

  const storage =
    storageFree > 0
      ? { store: { getFreeCapacity: (): number => storageFree } }
      : null;

  const sources = Array.from({ length: activeSources }, (_, i) => ({ id: `source${i}` }));

  return {
    store: { getUsedCapacity: (): number => energyCarried },
    pos: { findClosestByRange: (): object | null => spawn },
    room: {
      storage,
      find: (): object[] => sources
    }
  };
};

describe("evaluateTask", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).FIND_SOURCES_ACTIVE = 3;
    (global as any).RESOURCE_ENERGY = "energy";
  });

  // -------------------------------------------------------------------------
  // Priority 1 — spawn critical
  // -------------------------------------------------------------------------

  it("returns 'deposit' when spawn is critical and creep has energy", () => {
    // spawn at 20% (below 30% threshold), creep is carrying energy
    const creep = makeCreep({ energyCarried: 10, spawnEnergy: 60, spawnCapacity: 300, spawnFree: 240 });
    assert.equal(evaluateTask(creep), "deposit");
  });

  it("returns 'harvest' when spawn is critical and creep is empty but source is active", () => {
    const creep = makeCreep({ energyCarried: 0, spawnEnergy: 60, spawnCapacity: 300, spawnFree: 240, activeSources: 1 });
    assert.equal(evaluateTask(creep), "harvest");
  });

  // -------------------------------------------------------------------------
  // Priority 2 — creep has energy
  // -------------------------------------------------------------------------

  it("returns 'deposit' when spawn has room and creep has energy (non-critical)", () => {
    // spawn at 50%, creep has energy
    const creep = makeCreep({ energyCarried: 10, spawnEnergy: 150, spawnCapacity: 300, spawnFree: 150 });
    assert.equal(evaluateTask(creep), "deposit");
  });

  it("returns 'deposit' when spawn is full but storage has room and creep has energy", () => {
    const creep = makeCreep({
      energyCarried: 10,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      storageFree: 500
    });
    assert.equal(evaluateTask(creep), "deposit");
  });

  it("returns 'upgrade' when spawn and storage are both full and creep has energy", () => {
    const creep = makeCreep({
      energyCarried: 10,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      storageFree: 0
    });
    assert.equal(evaluateTask(creep), "upgrade");
  });

  // -------------------------------------------------------------------------
  // Priority 3 — creep is empty
  // -------------------------------------------------------------------------

  it("returns 'harvest' when creep is empty and a source is active", () => {
    const creep = makeCreep({ energyCarried: 0, spawnFree: 300, activeSources: 1 });
    assert.equal(evaluateTask(creep), "harvest");
  });

  it("returns 'upgrade' when creep is empty and no active source exists", () => {
    const creep = makeCreep({ energyCarried: 0, spawnFree: 300, activeSources: 0 });
    assert.equal(evaluateTask(creep), "upgrade");
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("returns 'harvest' when no spawn exists and creep is empty but source is active", () => {
    // no spawn — findClosestByRange returns null
    const creep = {
      store: { getUsedCapacity: (): number => 0 },
      pos: { findClosestByRange: (): null => null },
      room: {
        storage: null,
        find: (): object[] => [{ id: "source1" }]
      }
    };
    assert.equal(evaluateTask(creep as any), "harvest");
  });

  it("returns 'upgrade' when no spawn and no active source", () => {
    const creep = {
      store: { getUsedCapacity: (): number => 0 },
      pos: { findClosestByRange: (): null => null },
      room: { storage: null, find: (): object[] => [] }
    };
    assert.equal(evaluateTask(creep as any), "upgrade");
  });
});
