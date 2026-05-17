import { assert } from "chai";
import { rebalanceRoles } from "../../src/roleManager";
import { Game, Memory } from "./mock";

const makeCreep = (opts: {
  name: string;
  role: string;
  room: string;
  sourceId?: string;
  task?: string;
  spawning?: boolean;
  body?: Array<{ type: string }>;
}): any => ({
  name: opts.name,
  spawning: opts.spawning ?? false,
  body: opts.body ?? [{ type: "work" }, { type: "carry" }, { type: "move" }],
  memory: {
    role: opts.role,
    room: opts.room,
    sourceId: opts.sourceId ?? undefined,
    task: opts.task ?? undefined
  }
});

const makeRoom = (
  roomName: string,
  sources: Array<{ id: string; hasContainer: boolean }>
): any => {
  const mockSources = sources.map(s => ({
    id: s.id,
    pos: {
      findInRange: (constant: number): any[] => {
        if (constant === (global as any).FIND_STRUCTURES) {
          return s.hasContainer ? [{ structureType: (global as any).STRUCTURE_CONTAINER }] : [];
        }
        return [];
      }
    }
  }));

  return {
    name: roomName,
    find: (constant: number): any[] => {
      if (constant === (global as any).FIND_SOURCES) return mockSources;
      if (constant === (global as any).FIND_STRUCTURES) return [];
      return [];
    }
  };
};

const makeSpawn = (spawnName: string, room: any): any => ({
  name: spawnName,
  room,
  spawning: null
});

describe("rebalanceRoles", () => {
  beforeEach(() => {
    // @ts-ignore
    global.Game = _.clone(Game);
    // @ts-ignore
    global.Memory = _.clone(Memory);

    (global as any).FIND_SOURCES = 1;
    (global as any).FIND_STRUCTURES = 2;
    (global as any).FIND_MY_SPAWNS = 3;
    (global as any).STRUCTURE_CONTAINER = "container";
    (global as any).OK = 0;
    (global as any).WORK = "work";
    (global as any).CARRY = "carry";
    (global as any).MOVE = "move";
    (global as any).CREEP_LIFE_TIME = 1500;
    (global as any).BODYPART_COST = { work: 100, carry: 50, move: 50 };
    (global as any).Game.time = 1000;
  });

  // -------------------------------------------------------------------------
  // AC4 — reassign lower-priority over-target creep to higher-priority under-target role
  // -------------------------------------------------------------------------

  describe("AC4 — priority-based reassignment", () => {
    it("reassigns an over-target upgrader to miner when a container source is under-target", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const upgrader1 = makeCreep({ name: "Upgrader1", role: "upgrader", room: "W1N1" });
      const upgrader2 = makeCreep({ name: "Upgrader2", role: "upgrader", room: "W1N1" });
      (global as any).Game.creeps = { Upgrader1: upgrader1, Upgrader2: upgrader2 };

      rebalanceRoles();

      const roles = [upgrader1.memory.role, upgrader2.memory.role];
      assert.include(roles, "miner", "one upgrader should be reassigned to miner");
    });

    it("does not reassign when all roles are at or below their target counts", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const miner = makeCreep({ name: "Miner1", role: "miner", room: "W1N1", sourceId: "src-container" });
      const upgrader = makeCreep({ name: "Upgrader1", role: "upgrader", room: "W1N1" });
      (global as any).Game.creeps = { Miner1: miner, Upgrader1: upgrader };

      rebalanceRoles();

      assert.equal(miner.memory.role, "miner", "miner should not be reassigned");
      assert.equal(upgrader.memory.role, "upgrader", "upgrader should not be reassigned");
    });
  });

  // -------------------------------------------------------------------------
  // AC5 — stationaryHarvester creeps are never reassigned
  // -------------------------------------------------------------------------

  describe("AC5 — stationaryHarvester is never reassigned", () => {
    it("does not reassign a stationaryHarvester even when it is above target count", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const sh1 = makeCreep({
        name: "SH1",
        role: "stationaryHarvester",
        room: "W1N1",
        sourceId: "src-container",
        body: [
          { type: "work" }, { type: "work" }, { type: "work" },
          { type: "work" }, { type: "work" }, { type: "carry" }, { type: "move" }
        ]
      });
      const sh2 = makeCreep({
        name: "SH2",
        role: "stationaryHarvester",
        room: "W1N1",
        sourceId: "src-container",
        body: [
          { type: "work" }, { type: "work" }, { type: "work" },
          { type: "work" }, { type: "work" }, { type: "carry" }, { type: "move" }
        ]
      });
      (global as any).Game.creeps = { SH1: sh1, SH2: sh2 };

      rebalanceRoles();

      assert.equal(sh1.memory.role, "stationaryHarvester", "SH1 must not be reassigned");
      assert.equal(sh2.memory.role, "stationaryHarvester", "SH2 must not be reassigned");
    });

    it("does not reassign a stationaryHarvester even when a higher-priority role is under-target", () => {
      const room = makeRoom("W1N1", [{ id: "src-bare", hasContainer: false }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const sh = makeCreep({
        name: "SH1",
        role: "stationaryHarvester",
        room: "W1N1",
        sourceId: "src-bare",
        body: [
          { type: "work" }, { type: "work" }, { type: "work" },
          { type: "work" }, { type: "work" }, { type: "carry" }, { type: "move" }
        ]
      });
      (global as any).Game.creeps = { SH1: sh };

      rebalanceRoles();

      assert.equal(sh.memory.role, "stationaryHarvester", "stationaryHarvester must never be reassigned");
    });
  });

  // -------------------------------------------------------------------------
  // AC6 — miners displaced when stationaryHarvester is alive for same source
  // -------------------------------------------------------------------------

  describe("AC6 — miners displaced when stationaryHarvester is alive for same source", () => {
    it("reassigns a miner away from a source that already has a live stationaryHarvester", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const sh = makeCreep({
        name: "SH1",
        role: "stationaryHarvester",
        room: "W1N1",
        sourceId: "src-container",
        spawning: false,
        body: [
          { type: "work" }, { type: "work" }, { type: "work" },
          { type: "work" }, { type: "work" }, { type: "carry" }, { type: "move" }
        ]
      });
      const miner = makeCreep({
        name: "Miner1",
        role: "miner",
        room: "W1N1",
        sourceId: "src-container"
      });
      (global as any).Game.creeps = { SH1: sh, Miner1: miner };

      rebalanceRoles();

      assert.notEqual(
        miner.memory.role,
        "miner",
        "miner should be displaced from source covered by live stationaryHarvester"
      );
    });

    it("reassigns all miners at a source covered by a live stationaryHarvester", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const sh = makeCreep({
        name: "SH1",
        role: "stationaryHarvester",
        room: "W1N1",
        sourceId: "src-container",
        spawning: false,
        body: [
          { type: "work" }, { type: "work" }, { type: "work" },
          { type: "work" }, { type: "work" }, { type: "carry" }, { type: "move" }
        ]
      });
      const miner1 = makeCreep({ name: "Miner1", role: "miner", room: "W1N1", sourceId: "src-container" });
      const miner2 = makeCreep({ name: "Miner2", role: "miner", room: "W1N1", sourceId: "src-container" });
      (global as any).Game.creeps = { SH1: sh, Miner1: miner1, Miner2: miner2 };

      rebalanceRoles();

      assert.notEqual(miner1.memory.role, "miner", "Miner1 should be displaced");
      assert.notEqual(miner2.memory.role, "miner", "Miner2 should be displaced");
    });
  });

  // -------------------------------------------------------------------------
  // AC7 — miners NOT displaced during stationaryHarvester spawn window
  // -------------------------------------------------------------------------

  describe("AC7 — miners not displaced during stationaryHarvester spawn window", () => {
    it("does not displace miners when the stationaryHarvester for that source is still spawning", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const sh = makeCreep({
        name: "SH1",
        role: "stationaryHarvester",
        room: "W1N1",
        sourceId: "src-container",
        spawning: true,
        body: [
          { type: "work" }, { type: "work" }, { type: "work" },
          { type: "work" }, { type: "work" }, { type: "carry" }, { type: "move" }
        ]
      });
      const miner = makeCreep({
        name: "Miner1",
        role: "miner",
        room: "W1N1",
        sourceId: "src-container"
      });
      (global as any).Game.creeps = { SH1: sh, Miner1: miner };

      rebalanceRoles();

      assert.equal(
        miner.memory.role,
        "miner",
        "miner must not be displaced while stationaryHarvester is spawning"
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC12 — task and sourceId cleared on reassignment
  // -------------------------------------------------------------------------

  describe("AC12 — task and sourceId cleared when role is reassigned", () => {
    it("clears task and sourceId when a miner is reassigned to another role", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const miner1 = makeCreep({
        name: "Miner1",
        role: "miner",
        room: "W1N1",
        sourceId: "src-container",
        task: "harvestAndDeposit"
      });
      const miner2 = makeCreep({
        name: "Miner2",
        role: "miner",
        room: "W1N1",
        sourceId: "src-container",
        task: "harvestAndDeposit"
      });
      (global as any).Game.creeps = { Miner1: miner1, Miner2: miner2 };

      rebalanceRoles();

      const reassigned = [miner1, miner2].find(c => c.memory.role !== "miner");
      assert.isDefined(reassigned, "one miner should be reassigned");
      assert.isUndefined(reassigned!.memory.task, "task must be cleared on reassignment");
      assert.isUndefined(
        reassigned!.memory.sourceId,
        "sourceId must be cleared when leaving source-pinned role"
      );
    });

    it("clears task when an upgrader is reassigned to miner", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const upgrader1 = makeCreep({
        name: "Upgrader1",
        role: "upgrader",
        room: "W1N1",
        task: "upgrade"
      });
      const upgrader2 = makeCreep({
        name: "Upgrader2",
        role: "upgrader",
        room: "W1N1",
        task: "upgrade"
      });
      (global as any).Game.creeps = { Upgrader1: upgrader1, Upgrader2: upgrader2 };

      rebalanceRoles();

      const reassigned = [upgrader1, upgrader2].find(c => c.memory.role !== "upgrader");
      assert.isDefined(reassigned, "one upgrader should be reassigned");
      assert.isUndefined(reassigned!.memory.task, "task must be cleared on reassignment");
    });

    it("clears task and sourceId when a harvester with sourceId is reassigned away from its source", () => {
      const room = makeRoom("W1N1", [{ id: "src-bare", hasContainer: false }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const h1 = makeCreep({
        name: "H1",
        role: "harvester",
        room: "W1N1",
        sourceId: "src-bare",
        task: "harvest"
      });
      const h2 = makeCreep({
        name: "H2",
        role: "harvester",
        room: "W1N1",
        sourceId: "src-bare",
        task: "harvest"
      });
      (global as any).Game.creeps = { H1: h1, H2: h2 };

      rebalanceRoles();

      const reassigned = [h1, h2].find(c => c.memory.role !== "harvester");
      assert.isDefined(reassigned, "one harvester should be reassigned");
      assert.isUndefined(reassigned!.memory.task, "task must be cleared on reassignment");
      assert.isUndefined(
        reassigned!.memory.sourceId,
        "sourceId must be cleared when leaving source-pinned role"
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC13 — when stationaryHarvester dies, miner slot is filled from over-target roles
  // -------------------------------------------------------------------------

  describe("AC13 — miner slot refilled after stationaryHarvester death", () => {
    it("reassigns an over-target upgrader to miner when stationaryHarvester for that source is gone", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const upgrader1 = makeCreep({ name: "Upgrader1", role: "upgrader", room: "W1N1" });
      const upgrader2 = makeCreep({ name: "Upgrader2", role: "upgrader", room: "W1N1" });
      (global as any).Game.creeps = { Upgrader1: upgrader1, Upgrader2: upgrader2 };

      rebalanceRoles();

      const roles = [upgrader1.memory.role, upgrader2.memory.role];
      assert.include(
        roles,
        "miner",
        "one upgrader should be reassigned to miner to fill the vacant miner slot"
      );
    });

    it("assigns the correct sourceId to the newly reassigned miner", () => {
      const room = makeRoom("W1N1", [{ id: "src-container", hasContainer: true }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const upgrader1 = makeCreep({ name: "Upgrader1", role: "upgrader", room: "W1N1" });
      const upgrader2 = makeCreep({ name: "Upgrader2", role: "upgrader", room: "W1N1" });
      (global as any).Game.creeps = { Upgrader1: upgrader1, Upgrader2: upgrader2 };

      rebalanceRoles();

      const newMiner = [upgrader1, upgrader2].find(c => c.memory.role === "miner");
      assert.isDefined(newMiner, "one upgrader should become a miner");
      assert.equal(
        newMiner!.memory.sourceId,
        "src-container",
        "new miner should be pinned to the container source"
      );
    });
  });

  // -------------------------------------------------------------------------
  // Harvester wipeout guard
  // -------------------------------------------------------------------------

  describe("harvester wipeout guard", () => {
    it("converts a builder to harvester when no income-generating creep exists", () => {
      const room = makeRoom("W1N1", [{ id: "src-a", hasContainer: false }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const builder = makeCreep({ name: "Builder1", role: "builder", room: "W1N1" });
      const upgrader = makeCreep({ name: "Upgrader1", role: "upgrader", room: "W1N1" });
      (global as any).Game.creeps = { Builder1: builder, Upgrader1: upgrader };

      rebalanceRoles();

      assert.equal(builder.memory.role, "harvester", "builder should be converted to harvester on wipeout");
      assert.isUndefined(builder.memory.sourceId);
      assert.equal(upgrader.memory.role, "upgrader", "upgrader should not be touched when a builder can be converted");
    });

    it("converts an upgrader when no builder is available during wipeout", () => {
      const room = makeRoom("W1N1", [{ id: "src-a", hasContainer: false }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const upgrader = makeCreep({ name: "Upgrader1", role: "upgrader", room: "W1N1" });
      (global as any).Game.creeps = { Upgrader1: upgrader };

      rebalanceRoles();

      assert.equal(upgrader.memory.role, "harvester", "upgrader should be converted to harvester when no builder exists");
    });

    it("does not convert any creep when at least one harvester is alive", () => {
      const room = makeRoom("W1N1", [{ id: "src-a", hasContainer: false }]);
      const spawn = makeSpawn("Spawn1", room);
      (global as any).Game.spawns = { Spawn1: spawn };

      const harvester = makeCreep({ name: "Harvester1", role: "harvester", room: "W1N1" });
      const builder = makeCreep({ name: "Builder1", role: "builder", room: "W1N1" });
      (global as any).Game.creeps = { Harvester1: harvester, Builder1: builder };

      rebalanceRoles();

      assert.equal(builder.memory.role, "builder", "builder should not be converted when a harvester is alive");
    });
  });
});
