import { assert } from "chai";
import { evaluateTask } from "../../src/tasks/evaluator";
import { Game, Memory } from "./mock";

// ---------------------------------------------------------------------------
// Minimal creep factory — only the fields evaluateTask touches
// ---------------------------------------------------------------------------
const makeCreep = (opts: {
  role?: string;
  sourceId?: string;
  room?: string;
  energyCarried?: number;
  energyFree?: number;
  spawnEnergy?: number;
  spawnCapacity?: number;
  spawnFree?: number;
  storageFree?: number;
  activeSources?: number;
  allSources?: object[];
  constructionSites?: object[];
}): any => {
  const {
    role,
    sourceId,
    room,
    energyCarried = 0,
    energyFree = 300,
    spawnEnergy = 0,
    spawnCapacity = 300,
    spawnFree = 300,
    storageFree = 0,
    activeSources = 0,
    allSources = [],
    constructionSites = []
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

  const storage = storageFree > 0 ? { store: { getFreeCapacity: (): number => storageFree } } : null;

  const sources = Array.from({ length: activeSources }, (_, i) => ({ id: `source${i}` }));

  const memory: Record<string, unknown> = {};
  if (role != null) memory.role = role;
  if (sourceId != null) memory.sourceId = sourceId;
  if (room != null) memory.room = room;

  return {
    memory,
    store: { getUsedCapacity: (): number => energyCarried, getFreeCapacity: (): number => energyFree },
    pos: { findClosestByRange: (): object | null => spawn },
    room: {
      storage,
      find: (findType: number): object[] => {
        if (findType === (global as any).FIND_SOURCES_ACTIVE) return sources;
        if (findType === (global as any).FIND_SOURCES) return allSources;
        if (findType === (global as any).FIND_CONSTRUCTION_SITES) return constructionSites;
        return [];
      }
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
    (global as any).FIND_SOURCES = 4;
    (global as any).FIND_CONSTRUCTION_SITES = 5;
    (global as any).FIND_STRUCTURES = 6;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).STRUCTURE_CONTAINER = "container";
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
    const creep = makeCreep({
      energyCarried: 0,
      spawnEnergy: 60,
      spawnCapacity: 300,
      spawnFree: 240,
      activeSources: 1
    });
    assert.equal(evaluateTask(creep), "harvest");
  });

  // -------------------------------------------------------------------------
  // Priority 2 — creep is full
  // -------------------------------------------------------------------------

  it("returns 'deposit' when spawn has room and creep is full (non-critical)", () => {
    // spawn at 50%, creep is full
    const creep = makeCreep({
      energyCarried: 100,
      energyFree: 0,
      spawnEnergy: 150,
      spawnCapacity: 300,
      spawnFree: 150
    });
    assert.equal(evaluateTask(creep), "deposit");
  });

  it("returns 'deposit' when spawn is full but storage has room and creep is full", () => {
    const creep = makeCreep({
      energyCarried: 100,
      energyFree: 0,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      storageFree: 500
    });
    assert.equal(evaluateTask(creep), "deposit");
  });

  it("returns 'upgrade' when spawn and storage are both full and creep is full", () => {
    const creep = makeCreep({
      energyCarried: 100,
      energyFree: 0,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      storageFree: 0
    });
    assert.equal(evaluateTask(creep), "upgrade");
  });

  // -------------------------------------------------------------------------
  // Priority 3 — creep is not full, source available → keep harvesting
  // -------------------------------------------------------------------------

  it("returns 'harvest' when creep has partial energy and a source is active", () => {
    // creep is half-full; should continue harvesting rather than switching to deposit
    const creep = makeCreep({
      energyCarried: 50,
      energyFree: 50,
      spawnEnergy: 150,
      spawnCapacity: 300,
      spawnFree: 150,
      activeSources: 1
    });
    assert.equal(evaluateTask(creep), "harvest");
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
  // Priority 4 — creep has partial energy but no source → deliver what we have
  // -------------------------------------------------------------------------

  it("returns 'deposit' when creep has partial energy, no active source, and spawn has room", () => {
    const creep = makeCreep({
      energyCarried: 50,
      energyFree: 50,
      spawnEnergy: 150,
      spawnCapacity: 300,
      spawnFree: 150,
      activeSources: 0
    });
    assert.equal(evaluateTask(creep), "deposit");
  });

  it("returns 'upgrade' when creep has partial energy, no active source, and no deposit target", () => {
    const creep = makeCreep({
      energyCarried: 50,
      energyFree: 50,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      storageFree: 0,
      activeSources: 0
    });
    assert.equal(evaluateTask(creep), "upgrade");
  });

  // -------------------------------------------------------------------------
  // Fallback / Priority 5 — creep is empty
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
      store: { getUsedCapacity: (): number => 0, getFreeCapacity: (): number => 300 },
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
      store: { getUsedCapacity: (): number => 0, getFreeCapacity: (): number => 300 },
      pos: { findClosestByRange: (): null => null },
      room: { storage: null, find: (): object[] => [] }
    };
    assert.equal(evaluateTask(creep as any), "upgrade");
  });

  // -------------------------------------------------------------------------
  // Role routing
  // -------------------------------------------------------------------------

  it("returns 'harvestAndDeposit' immediately for stationaryHarvester", () => {
    const creep = makeCreep({
      role: "stationaryHarvester",
      energyCarried: 0,
      energyFree: 300,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      activeSources: 0
    });

    assert.equal(evaluateTask(creep), "harvestAndDeposit");
  });

  it("returns 'deposit' for hauler when creep has energy and can deposit", () => {
    const creep = makeCreep({
      role: "hauler",
      energyCarried: 25,
      energyFree: 75,
      spawnEnergy: 150,
      spawnCapacity: 300,
      spawnFree: 150,
      activeSources: 1
    });

    assert.equal(evaluateTask(creep), "deposit");
  });

  it("returns 'forage' for hauler when deposit condition is not met", () => {
    const creep = makeCreep({
      role: "hauler",
      energyCarried: 0,
      spawnEnergy: 150,
      spawnCapacity: 300,
      spawnFree: 150,
      activeSources: 1
    });

    assert.equal(evaluateTask(creep), "forage");
  });

  it("returns 'build' for builder when a construction site exists", () => {
    const creep = makeCreep({
      role: "builder",
      activeSources: 1,
      constructionSites: [{ id: "site1" }]
    });

    assert.equal(evaluateTask(creep), "build");
  });

  it("returns 'build' for builder when any source lacks adjacent container infrastructure", () => {
    const sourceWithoutContainer = {
      pos: {
        findInRange: (findType: number): object[] => {
          if (findType === (global as any).FIND_STRUCTURES) return [];
          if (findType === (global as any).FIND_CONSTRUCTION_SITES) return [];
          return [];
        }
      }
    };

    const creep = makeCreep({
      role: "builder",
      activeSources: 1,
      allSources: [sourceWithoutContainer],
      constructionSites: []
    });

    assert.equal(evaluateTask(creep), "build");
  });

  it("falls through to generic logic for idle builder when build conditions are not met", () => {
    const sourceWithContainerSite = {
      pos: {
        findInRange: (findType: number): object[] => {
          if (findType === (global as any).FIND_STRUCTURES) return [];
          if (findType === (global as any).FIND_CONSTRUCTION_SITES) {
            return [{ structureType: (global as any).STRUCTURE_CONTAINER }];
          }
          return [];
        }
      }
    };

    const creep = makeCreep({
      role: "builder",
      energyCarried: 0,
      energyFree: 100,
      activeSources: 1,
      allSources: [sourceWithContainerSite],
      constructionSites: []
    });

    assert.equal(evaluateTask(creep), "harvest");
  });

  it("keeps generic evaluator behavior for harvester and upgrader roles", () => {
    const harvester = makeCreep({
      role: "harvester",
      energyCarried: 100,
      energyFree: 0,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      storageFree: 0
    });

    const upgrader = makeCreep({
      role: "upgrader",
      energyCarried: 0,
      energyFree: 100,
      spawnEnergy: 300,
      spawnCapacity: 300,
      spawnFree: 0,
      activeSources: 1
    });

    assert.equal(evaluateTask(harvester), "upgrade");
    assert.equal(evaluateTask(upgrader), "harvest");
  });

  // -------------------------------------------------------------------------
  // Container-harvester routing
  // -------------------------------------------------------------------------

  describe("harvester pinned to container source", () => {
    const makeContainerSource = (id: string): object => ({
      id,
      pos: {
        findInRange: (findType: number): object[] => {
          if (findType === (global as any).FIND_STRUCTURES) {
            return [{ structureType: (global as any).STRUCTURE_CONTAINER }];
          }
          return [];
        }
      }
    });

    const makeBarePinnedSource = (id: string): object => ({
      id,
      pos: {
        findInRange: (_findType: number): object[] => []
      }
    });

    beforeEach(() => {
      (global as any).Game.getObjectById = (_id: string): null => null;
    });

    it("returns 'harvestAndDeposit' when pinned source has an adjacent container", () => {
      const srcId = "src-container";
      const containerSrc = makeContainerSource(srcId);
      (global as any).Game.getObjectById = (id: string): object | null =>
        id === srcId ? containerSrc : null;
      // 1 container source in the room, 1 hauler → 1 >= 1 → goes stationary
      (global as any).Game.creeps = {
        Hauler1: { memory: { room: "W1N1", role: "hauler" } }
      };

      const creep = makeCreep({ role: "harvester", sourceId: srcId, room: "W1N1", allSources: [containerSrc] });
      assert.equal(evaluateTask(creep), "harvestAndDeposit");
    });

    it("falls through to generic logic when pinned source has no adjacent container", () => {
      const srcId = "src-bare";
      (global as any).Game.getObjectById = (id: string): object | null =>
        id === srcId ? makeBarePinnedSource(srcId) : null;

      // Creep is empty, active source available → should harvest
      const creep = makeCreep({ role: "harvester", sourceId: srcId, room: "W1N1", activeSources: 1 });
      assert.equal(evaluateTask(creep), "harvest");
    });

    it("falls through to generic logic when getObjectById returns null", () => {
      (global as any).Game.getObjectById = (_id: string): null => null;

      const creep = makeCreep({ role: "harvester", sourceId: "missing-source", room: "W1N1", activeSources: 1 });
      assert.equal(evaluateTask(creep), "harvest");
    });

    it("falls through to generic logic when hauler count is below container source count", () => {
      const srcId = "src-container";
      const containerSrc = makeContainerSource(srcId);
      (global as any).Game.getObjectById = (id: string): object | null =>
        id === srcId ? containerSrc : null;
      // 1 container source, 0 haulers → 0 >= 1 fails → stays mobile
      (global as any).Game.creeps = {};

      // Creep is empty, active source available → should harvest (mobile)
      const creep = makeCreep({
        role: "harvester",
        sourceId: srcId,
        room: "W1N1",
        allSources: [containerSrc],
        activeSources: 1
      });
      assert.equal(evaluateTask(creep), "harvest");
    });

    it("spawn-critical deposit takes priority over container-harvester route", () => {
      const srcId = "src-container";
      (global as any).Game.getObjectById = (id: string): object | null =>
        id === srcId ? makeContainerSource(srcId) : null;

      // Spawn is critical (<30%), creep has energy → should deposit, not harvestAndDeposit
      const creep = makeCreep({
        role: "harvester",
        sourceId: srcId,
        room: "W1N1",
        energyCarried: 10,
        spawnEnergy: 60,
        spawnCapacity: 300,
        spawnFree: 240
      });
      assert.equal(evaluateTask(creep), "deposit");
    });
  });
});
