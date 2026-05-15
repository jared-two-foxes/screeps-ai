# Stationary Harvester + Hauler + Builder — Implementation Plan

## Overview

Replace self-hauling harvesters with a three-role system:
- **Stationary Harvester** — sits on a source-adjacent container, harvests constantly, fills the container
- **Hauler** — pulls energy from the container, delivers to spawn/storage
- **Builder** — places and builds the container so the strategy can activate

---

## Subtasks (independent, ordered)

### 1 — Types
**File:** `src/types.d.ts`

Add to the role union:
```
"stationaryHarvester" | "hauler" | "builder"
```

Add to the task union:
```
"harvestAndDeposit" | "forage" | "build"
```

**Test:** `test/unit/types.test.ts`

---

### 2 — Harvest-and-deposit task (stationary harvester)
**New file:** `src/tasks/harvestAndDeposit.ts`

```
- Always returns false (never "done" — stays on this task forever)
- If not at source: moveTo(source)
- If not full: harvest(source)
- If carry is full:
    - Find STRUCTURE_CONTAINER on adjacent tile → transfer(container, RESOURCE_ENERGY)
    - Fallback: drop(RESOURCE_ENERGY)
- moveTo/moveTo on ERR_NOT_IN_RANGE
```

Edge cases: source disappears, container is destroyed mid-tick, creep gets surrounded.

**Test:** `test/unit/harvestAndDepositTask.test.ts`

---

### 3 — Forage task (hauler)
**New file:** `src/tasks/forage.ts`

```
- Returns true when creep is full (triggers re-evaluate → "deposit")
- Find STRUCTURE_CONTAINER near source area that has energy:
    - withdraw(container, RESOURCE_ENERGY)
    - moveTo on ERR_NOT_IN_RANGE
- Fallback if no container with energy:
    - Find FIND_DROPPED_RESOURCES near source area → pickup(resource)
    - moveTo on ERR_NOT_IN_RANGE
- Returns true if nothing available to forage
```

Edge cases: container is empty, no dropped resources, hauler is already full on entry.

**Test:** `test/unit/forageTask.test.ts`

---

### 4 — Build task (builder)
**New file:** `src/tasks/build.ts`

```
- Returns true when no construction sites exist (re-evaluate to other tasks)
- Place-site logic (runs first, only when container missing):
    - For each source without an adjacent container:
        - Find an open tile adjacent to the source
        - creep.room.createConstructionSite(x, y, STRUCTURE_CONTAINER)
        (only one attempt per source per tick)
- If creep is empty: harvest source or withdraw from storage
- If creep has energy: find nearest construction site → build(site), moveTo on ERR_NOT_IN_RANGE
```

Edge cases: no build energy available, no open tiles near source, nothing to build.

**Test:** `test/unit/buildTask.test.ts`

---

### 5 — Evaluator
**File:** `src/tasks/evaluator.ts`

**Add early-return branches** before the existing generic logic:

```
if (creep.memory.role === "stationaryHarvester")
    return "harvestAndDeposit"

if (creep.memory.role === "hauler") {
    if (creepHasEnergy && canDeposit) return "deposit"
    return "forage"
}

if (creep.memory.role === "builder") {
    if (constructionSiteExists()) return "build"
    // fall through to generic logic — can work as harvester/upgrader when idle
}
```

Existing generic logic (for "harvester" and "upgrader" roles) stays unchanged.

**Test:** `test/unit/evaluator.test.ts`

---

### 6 — Runner
**File:** `src/tasks/runner.ts`

Add three new switch cases:

```
case "harvestAndDeposit":
    return runHarvestAndDepositTask(creep)
case "forage":
    return runForageTask(creep)
case "build":
    return runBuildTask(creep)
```

Import all three new functions.

**Test:** `test/unit/runner.test.ts`

---

### 7 — Spawner with readiness check + new plans
**File:** `src/spawner.ts`

**Readiness check** (new function):

```ts
const canUseStationaryStrategy = (): boolean => {
    // 1. Can the cheapest spawn afford [WORK×5, CARRY×1, MOVE×1] (600 energy)?
    const spawn = Object.values(Game.spawns).find(s => s.spawning == null);
    if (spawn == null) return false;
    const capacity = spawn.store.getCapacity(RESOURCE_ENERGY) ?? 300;
    if (capacity < 600) return false;

    // 2. Does a STRUCTURE_CONTAINER exist adjacent to at least one source?
    const sources = spawn.room.find(FIND_SOURCES);
    return sources.some(source =>
        source.pos.findInRange(FIND_STRUCTURES, 1).some(s => s.structureType === STRUCTURE_CONTAINER)
    );
};
```

**Spawn plans** become conditional:

| Strategy active | Plan order (thresholds) |
|---|---|
| Yes | stationaryHarvester(1), hauler(2), harvester(1), builder(1), upgrader(1) |
| No | harvester(2), builder(1), upgrader(1) |

Old harvester threshold drops from 2 → 1 when stationary strategy is active to avoid over-crowding the source.

**Multi-plan fallthrough** — if a plan exhausts all spawns without success, try the next plan. Stop on first success.

**Corpses/memory:** the old "harvester" creeps that die naturally over the transition are not replaced (their threshold is 1, and the stationary harvester + haulers handle the energy). No explicit cleanup needed.

**Test:** `test/unit/spawner.test.ts`

---

### 8 — Verify
```
npm run lint
npx tsc --noEmit
npm test
npm run build
```

---

## Summary of changes

| # | Subtask | New files | Modified files |
|---|---|---|---|
| 1 | Types | — | `src/types.d.ts`, `test/unit/types.test.ts` |
| 2 | Harvest-and-deposit task | `src/tasks/harvestAndDeposit.ts`, `test/unit/harvestAndDepositTask.test.ts` | — |
| 3 | Forage task | `src/tasks/forage.ts`, `test/unit/forageTask.test.ts` | — |
| 4 | Build task | `src/tasks/build.ts`, `test/unit/buildTask.test.ts` | — |
| 5 | Evaluator | — | `src/tasks/evaluator.ts`, `test/unit/evaluator.test.ts` |
| 6 | Runner | — | `src/tasks/runner.ts`, `test/unit/runner.test.ts` |
| 7 | Spawner + readiness | — | `src/spawner.ts`, `test/unit/spawner.test.ts` |
| 8 | Verify | — | — |
