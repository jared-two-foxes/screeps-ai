# Task-Based Creep System — Implementation Plan

## Background

Harvesters idle when the spawn is full and there is no storage, because
`harvester.ts` returns early when `target == null`. The single upgrader cannot
drain the spawn fast enough. The fix is a task-driven system where a creep
re-evaluates what to do when its current task completes, rather than being
locked into a role forever.

## Core Concepts

| Concept | Meaning |
|---|---|
| `role` | Immutable — set at spawn, used only by the spawner for quota/body decisions. Never changes. |
| `task` | Dynamic — drives actual per-tick behaviour. Re-evaluated each time the current task completes. |

A harvester-role creep can hold a `"upgrade"` task. The spawner still counts
it as a harvester, so no over-spawning occurs.

## Priority Logic (evaluator)

```
CRITICAL_THRESHOLD = 0.30  (30% of spawn energy capacity)

evaluateTask(creep):
  1. Spawn is critical AND creep has energy AND spawn has room  → "deposit"
  2. Spawn is critical AND creep is empty AND source is active  → "harvest"
  3. Creep has energy AND (spawn OR storage has room)           → "deposit"
  4. Creep has energy AND spawn AND storage both full           → "upgrade"  ← fixes idling
  5. Creep is empty AND source is active                        → "harvest"
  6. Creep is empty AND no active source                        → "upgrade"  (waits internally)
```

Re-evaluation happens **on task completion only** (not mid-task). This avoids
thrashing.

## Task Completion Triggers

| Task | Completes when |
|---|---|
| `harvest` | Store is full, OR no source found |
| `deposit` | Store is empty, OR no valid target found, OR `ERR_FULL` returned |
| `upgrade` | Store is empty after upgrading |

## Steps

### Step 1 — Type Foundations

**Files:** `src/types.d.ts`

Add `TaskType` and `task?` to `CreepMemory`. Keep `working?` — old role files
still reference it and must continue to compile.

```typescript
type TaskType = "harvest" | "deposit" | "upgrade";

interface CreepMemory {
  role: "harvester" | "upgrader";
  room: string;
  working?: boolean;  // stays until Step 8
  task?: TaskType;    // new
}
```

Verification: `npx tsc --noEmit && npm test && npm run build` — all green
(purely additive change).

---

### Step 2 — Task Evaluator

**Files:** `src/tasks/evaluator.ts` (new), `test/unit/evaluator.test.ts` (new)

Implement `evaluateTask(creep: Creep): TaskType`. No integration with
`main.ts` yet — purely a library function with its own tests.

Test cases to cover:
- spawn critical + creep has energy → `"deposit"`
- spawn critical + creep empty + source active → `"harvest"`
- spawn has room + creep has energy → `"deposit"`
- spawn full + storage full + creep has energy → `"upgrade"`
- creep empty + source active → `"harvest"`
- creep empty + no active source → `"upgrade"`

Verification: all existing tests pass; new evaluator tests pass.

---

### Step 3 — Harvest Task Runner

**Files:** `src/tasks/harvest.ts` (new), `test/unit/harvestTask.test.ts` (new)

Implement `runHarvestTask(creep: Creep): boolean`. Returns `true` when the
task is complete (store full, or no source found). Old role files untouched.

Verification: all existing tests pass; new harvest task tests pass.

---

### Step 4 — Deposit Task Runner

**Files:** `src/tasks/deposit.ts` (new), `test/unit/depositTask.test.ts` (new)

Implement `runDepositTask(creep: Creep): boolean`. Returns `true` when store
is empty, no valid target exists, or `ERR_FULL` is returned (target just
filled mid-delivery). Extracts the deposit-half logic from `roles/harvester.ts`
— old role file untouched.

Verification: all existing tests pass; new deposit task tests pass.

---

### Step 5 — Upgrade Task Runner

**Files:** `src/tasks/upgrade.ts` (new), `test/unit/upgradeTask.test.ts` (new)

Implement `runUpgradeTask(creep: Creep): boolean`. Self-contained: if the
store is empty it gathers energy (storage withdraw first, then source harvest),
then upgrades the controller. Returns `true` when the store empties after
upgrading. Extracts logic from `roles/upgrader.ts` — old role file untouched.

Verification: all existing tests pass; new upgrade task tests pass.

---

### Step 6 — Task Runner Dispatcher

**Files:** `src/tasks/runner.ts` (new), `test/unit/runner.test.ts` (new)

Implement `runTask(creep: Creep): boolean`. Switches on `creep.memory.task`
and delegates to the runners from Steps 3–5.

```typescript
export function runTask(creep: Creep): boolean {
  switch (creep.memory.task) {
    case "harvest": return runHarvestTask(creep);
    case "deposit": return runDepositTask(creep);
    case "upgrade": return runUpgradeTask(creep);
    default:        return true; // unknown/missing task → force re-evaluation
  }
}
```

Tests verify correct dispatch routing for each task type.

Verification: all existing tests pass; new runner tests pass.

---

### Step 7 — Wire the Main Loop

**Files:** `src/main.ts` (modify), `test/unit/main.test.ts` (modify)

Replace the `if role === "harvester" / else if role === "upgrader"` dispatch
with task-based dispatch. Old role files still exist and compile — they are
simply no longer imported.

```typescript
for (const creepName in Game.creeps) {
  const creep = Game.creeps[creepName];
  if (creep.memory.task == null) {
    creep.memory.task = evaluateTask(creep);
  }
  const done = runTask(creep);
  if (done) {
    creep.memory.task = evaluateTask(creep);
    // new task executes on the next tick
  }
}
```

Update `main.test.ts`: replace role-dispatch tests with task-dispatch tests
(e.g., a creep with `task: "harvest"` triggers harvest behaviour). The old
`harvester.test.ts` and `upgrader.test.ts` still pass because they import
the role files directly.

Verification: full suite green, including old role tests.

---

### Step 8 — Cleanup

**Files to delete:**
- `src/roles/harvester.ts`
- `src/roles/upgrader.ts`
- `test/unit/harvester.test.ts`
- `test/unit/upgrader.test.ts`

**Files to modify:**
- `src/types.d.ts` — remove `working?: boolean` from `CreepMemory`
- `src/spawner.ts` — remove `working: false` from spawn memory initializer

Verification — run the full sequence:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

---

## Summary Table

| Step | Changes | Deletions | New Tests |
|---|---|---|---|
| 1 | `types.d.ts` — `TaskType`, `task?` | — | — |
| 2 | `tasks/evaluator.ts` | — | `evaluator.test.ts` |
| 3 | `tasks/harvest.ts` | — | `harvestTask.test.ts` |
| 4 | `tasks/deposit.ts` | — | `depositTask.test.ts` |
| 5 | `tasks/upgrade.ts` | — | `upgradeTask.test.ts` |
| 6 | `tasks/runner.ts` | — | `runner.test.ts` |
| 7 | `main.ts`, `main.test.ts` | — (role files just unused) | — |
| 8 | `types.d.ts`, `spawner.ts` cleaned | role files + their tests | — |

Steps 1–6 are purely additive. Step 7 is the integration point. Step 8 is
the teardown. Each step is independently buildable and verifiable before
moving to the next.
