import { assert } from "chai";
import { evaluateTask } from "../../src/tasks/evaluator";
import { Game, Memory } from "./mock";

// ---------------------------------------------------------------------------
// Body constants
// ---------------------------------------------------------------------------
const WORKER_BODY = [
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "move", hits: 100, hitsMax: 100 }
];
const SH_BODY = [
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "move", hits: 100, hitsMax: 100 }
];
const SU_BODY = [
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "work", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "move", hits: 100, hitsMax: 100 }
];
const HAULER_BODY = [
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "carry", hits: 100, hitsMax: 100 },
  { type: "move", hits: 100, hitsMax: 100 },
  { type: "move", hits: 100, hitsMax: 100 },
  { type: "move", hits: 100, hitsMax: 100 },
  { type: "move", hits: 100, hitsMax: 100 }
];

// ---------------------------------------------------------------------------
// RoomSlots factory
// ---------------------------------------------------------------------------
const makeSlots = (opts: {
  taskCounts?: Partial<Record<string, number>>;
  economyTarget?: number;
  hasBuildSites?: boolean;
  hasControllerContainer?: boolean;
  hasActiveStationaryUpgrader?: boolean;
}): any => ({
  taskCounts: opts.taskCounts ?? {},
  economyTarget: opts.economyTarget ?? 1,
  hasBuildSites: opts.hasBuildSites ?? false,
  hasControllerContainer: opts.hasControllerContainer ?? false,
  hasActiveStationaryUpgrader: opts.hasActiveStationaryUpgrader ?? false
});

// ---------------------------------------------------------------------------
// Creep factory
// ---------------------------------------------------------------------------
const makeCreep = (opts: {
  body?: any[];
  energyCarried?: number;
  energyFree?: number;
  room?: string;
  sourceId?: string;
  roomEnergyAvailable?: number;
  roomEnergyCapacity?: number;
  constructionSites?: object[];
  sources?: object[];
  spawns?: object[];
}): any => {
  const {
    body = WORKER_BODY,
    energyCarried = 0,
    energyFree = 300,
    room = "W1N1",
    sourceId,
    roomEnergyAvailable = 300,
    roomEnergyCapacity = 300,
    constructionSites = [],
    sources = [],
    spawns = []
  } = opts;

  const memory: Record<string, unknown> = { room };
  if (sourceId != null) memory.sourceId = sourceId;

  return {
    body,
    memory,
    store: {
      getUsedCapacity: (): number => energyCarried,
      getFreeCapacity: (): number => energyFree
    },
    room: {
      name: room,
      energyAvailable: roomEnergyAvailable,
      energyCapacityAvailable: roomEnergyCapacity,
      controller: { pos: { x: 20, y: 20 } },
      storage: undefined,
      find: (findType: number): object[] => {
        if (findType === (global as any).FIND_CONSTRUCTION_SITES) return constructionSites;
        if (findType === (global as any).FIND_SOURCES) return sources;
        if (findType === (global as any).FIND_SOURCES_ACTIVE) return sources;
        if (findType === (global as any).FIND_MY_SPAWNS) return spawns;
        return [];
      }
    }
  };
};

describe("evaluateTask (body-aware dispatch)", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);
    (global as any).FIND_SOURCES_ACTIVE = 3;
    (global as any).FIND_SOURCES = 4;
    (global as any).FIND_CONSTRUCTION_SITES = 5;
    (global as any).FIND_STRUCTURES = 6;
    (global as any).FIND_MY_STRUCTURES = 108;
    (global as any).FIND_MY_SPAWNS = 2;
    (global as any).RESOURCE_ENERGY = "energy";
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).STRUCTURE_EXTENSION = "extension";
    (global as any).WORK = "work";
    (global as any).CARRY = "carry";
    (global as any).MOVE = "move";
    (global as any).BODYPART_COST = { work: 100, carry: 50, move: 50 };
    (global as any).CREEP_LIFE_TIME = 1500;
  });

  // -------------------------------------------------------------------------
  // Specialized body routing
  // -------------------------------------------------------------------------

  describe("specialized body routing", () => {
    it("stationaryHarvester body always returns 'harvestAndDeposit'", () => {
      const creep = makeCreep({ body: SH_BODY });
      const slots = makeSlots({});
      assert.equal(evaluateTask(creep, slots), "harvestAndDeposit");
    });

    it("stationaryUpgrader body always returns 'upgradeFromContainer'", () => {
      const creep = makeCreep({ body: SU_BODY });
      const slots = makeSlots({});
      assert.equal(evaluateTask(creep, slots), "upgradeFromContainer");
    });

    it("hauler body with energy and spawn has room → 'deposit'", () => {
      const spawn = { store: { getFreeCapacity: (): number => 100 } };
      const creep = makeCreep({
        body: HAULER_BODY,
        energyCarried: 25,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300,
        spawns: [spawn]
      });
      const slots = makeSlots({});
      assert.equal(evaluateTask(creep, slots), "deposit");
    });

    it("hauler body with no energy → 'forage'", () => {
      const creep = makeCreep({ body: HAULER_BODY, energyCarried: 0 });
      const slots = makeSlots({});
      assert.equal(evaluateTask(creep, slots), "forage");
    });

    it("hauler body with energy → always returns 'deposit' (deposit task handles target selection)", () => {
      const creep = makeCreep({
        body: HAULER_BODY,
        energyCarried: 10,
        spawns: []
      });
      const slots = makeSlots({});
      assert.equal(evaluateTask(creep, slots), "deposit");
    });
  });

  // -------------------------------------------------------------------------
  // Emergency override
  // -------------------------------------------------------------------------

  describe("emergency override", () => {
    it("worker body, room at 20% capacity with energy → 'deposit'", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 10,
        roomEnergyAvailable: 60,
        roomEnergyCapacity: 300
      });
      const slots = makeSlots({});
      assert.equal(evaluateTask(creep, slots), "deposit");
    });

    it("worker body, room at 20% capacity, no energy → 'harvest'", () => {
      const source = { id: "src1", pos: { findInRange: (): object[] => [] } };
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 0,
        roomEnergyAvailable: 60,
        roomEnergyCapacity: 300,
        sources: [source]
      });
      const slots = makeSlots({});
      assert.equal(evaluateTask(creep, slots), "harvest");
    });

    it("worker body, room above 30% → does NOT trigger emergency override, falls to slot fill", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 50,
        roomEnergyAvailable: 100,
        roomEnergyCapacity: 300
      });
      const slots = makeSlots({
        economyTarget: 0,
        taskCounts: { harvest: 1, upgrade: 0 },
        hasActiveStationaryUpgrader: false
      });
      assert.equal(evaluateTask(creep, slots), "upgrade");
    });
  });

  // -------------------------------------------------------------------------
  // Slot fill priority
  // -------------------------------------------------------------------------

  describe("slot fill priority", () => {
    it("harvest slot unfilled → returns 'harvest' and pins sourceId", () => {
      const source = {
        id: "src-pin",
        pos: {
          findInRange: (): object[] => []
        }
      };
      (global as any).Game.creeps = {};
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 0,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300,
        sources: [source]
      });
      const slots = makeSlots({
        economyTarget: 1,
        taskCounts: { harvest: 0 },
        hasBuildSites: false,
        hasActiveStationaryUpgrader: false
      });
      const result = evaluateTask(creep, slots);
      assert.equal(result, "harvest");
      assert.isNotNull(creep.memory.sourceId, "sourceId should be pinned after harvest assignment");
      assert.isDefined(creep.memory.sourceId, "sourceId should be defined after harvest assignment");
    });

    it("harvest slot filled, creep has energy → skips to upgrade minimum check → 'upgrade'", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 50,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300
      });
      const slots = makeSlots({
        economyTarget: 1,
        taskCounts: { harvest: 1, upgrade: 0 },
        hasActiveStationaryUpgrader: false
      });
      assert.equal(evaluateTask(creep, slots), "upgrade");
    });

    it("harvest slot filled, creep has NO energy → 'harvest' (single-phase: refill first)", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 0,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300
      });
      const slots = makeSlots({
        economyTarget: 1,
        taskCounts: { harvest: 1, upgrade: 0 },
        hasActiveStationaryUpgrader: false
      });
      assert.equal(evaluateTask(creep, slots), "harvest");
    });

    it("harvest filled, stationaryUpgrader active, no build sites, creep has energy → 'upgrade'", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 50,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300
      });
      const slots = makeSlots({
        economyTarget: 1,
        taskCounts: { harvest: 1 },
        hasActiveStationaryUpgrader: true,
        hasBuildSites: false
      });
      assert.equal(evaluateTask(creep, slots), "upgrade");
    });

    it("harvest filled, stationaryUpgrader active, build sites present, creep has energy → 'build'", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 50,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300
      });
      const slots = makeSlots({
        economyTarget: 1,
        taskCounts: { harvest: 1 },
        hasActiveStationaryUpgrader: true,
        hasBuildSites: true
      });
      assert.equal(evaluateTask(creep, slots), "build");
    });

    it("harvest filled, no stationaryUpgrader but upgrade minimum met (≥1 upgrader), creep has energy → 'upgrade'", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 50,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300
      });
      const slots = makeSlots({
        economyTarget: 1,
        taskCounts: { harvest: 1, upgrade: 1 },
        hasActiveStationaryUpgrader: false,
        hasBuildSites: false
      });
      assert.equal(evaluateTask(creep, slots), "upgrade");
    });

    it("non-harvest task clears sourceId from creep memory", () => {
      const creep = makeCreep({
        body: WORKER_BODY,
        energyCarried: 50,
        roomEnergyAvailable: 200,
        roomEnergyCapacity: 300,
        sourceId: "some-source"
      });
      const slots = makeSlots({
        economyTarget: 1,
        taskCounts: { harvest: 1, upgrade: 0 },
        hasActiveStationaryUpgrader: false
      });
      evaluateTask(creep, slots);
      assert.isUndefined(creep.memory.sourceId, "sourceId should be cleared when not harvesting");
    });
  });
});
