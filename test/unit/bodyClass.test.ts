import { assert } from "chai";
import { classifyBody } from "../../src/utils/bodyClass";

// This module does not exist yet — import will fail at require time → all tests in this file fail.

const makeBody = (parts: string[]): Array<{ type: string; hits: number; hitsMax: number }> =>
  parts.map(type => ({ type, hits: 100, hitsMax: 100 }));

describe("classifyBody", () => {
  beforeEach(() => {
    (global as any).WORK = "work";
    (global as any).CARRY = "carry";
    (global as any).MOVE = "move";
  });

  describe("WORK part counts", () => {
    it("classifies [WORK×5, CARRY×1, MOVE×1] as stationaryHarvester", () => {
      const body = makeBody(["work", "work", "work", "work", "work", "carry", "move"]);
      assert.equal(classifyBody({ body } as any), "stationaryHarvester");
    });

    it("classifies [WORK×5, CARRY×3, MOVE×1] as stationaryUpgrader", () => {
      const body = makeBody(["work", "work", "work", "work", "work", "carry", "carry", "carry", "move"]);
      assert.equal(classifyBody({ body } as any), "stationaryUpgrader");
    });

    it("classifies [WORK×1, CARRY×1, MOVE×1] as worker", () => {
      const body = makeBody(["work", "carry", "move"]);
      assert.equal(classifyBody({ body } as any), "worker");
    });

    it("classifies [CARRY×4, MOVE×4] as hauler (0 WORK)", () => {
      const body = makeBody(["carry", "carry", "carry", "carry", "move", "move", "move", "move"]);
      assert.equal(classifyBody({ body } as any), "hauler");
    });

    it("classifies [WORK×5, CARRY×2, MOVE×1] as stationaryHarvester (CARRY ≤ 2)", () => {
      const body = makeBody(["work", "work", "work", "work", "work", "carry", "carry", "move"]);
      assert.equal(classifyBody({ body } as any), "stationaryHarvester");
    });

    it("classifies [WORK×6, CARRY×4, MOVE×2] as stationaryUpgrader", () => {
      const body = makeBody([
        "work", "work", "work", "work", "work", "work",
        "carry", "carry", "carry", "carry",
        "move", "move"
      ]);
      assert.equal(classifyBody({ body } as any), "stationaryUpgrader");
    });
  });

  describe("counts ALL parts regardless of damage (hits:0)", () => {
    it("counts damaged WORK parts (hits:0) — 5 WORK total → stationaryHarvester", () => {
      const body = [
        { type: "work", hits: 0, hitsMax: 100 },
        { type: "work", hits: 0, hitsMax: 100 },
        { type: "work", hits: 0, hitsMax: 100 },
        { type: "work", hits: 100, hitsMax: 100 },
        { type: "work", hits: 100, hitsMax: 100 },
        { type: "carry", hits: 100, hitsMax: 100 },
        { type: "move", hits: 100, hitsMax: 100 }
      ];
      assert.equal(classifyBody({ body } as any), "stationaryHarvester");
    });

    it("classifies fully destroyed hauler body (all hits 0) as hauler", () => {
      const body = [
        { type: "carry", hits: 0, hitsMax: 100 },
        { type: "move", hits: 0, hitsMax: 100 }
      ];
      assert.equal(classifyBody({ body } as any), "hauler");
    });
  });
});
