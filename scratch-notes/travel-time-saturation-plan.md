# Travel-Time-Aware Source Saturation — Implementation Plan

## Goal

Redesign early-game creep spawning to use travel-time-aware source saturation, split sources
between spawn-supply and controller-supply roles, and grow upgraders continuously after
spawn-side saturation.

---

## Constraints & Preferences

- Storage tier (RCL 4) deferred — not part of this change
- All roles use doubled body `[WORK,CARRY,MOVE,WORK,CARRY,MOVE]` when `energyCapacityAvailable >= 400`
- Path distances cached permanently (no invalidation) using `PathFinder.search()` with
  `ignoreCreeps: true`; Chebyshev fallback if path incomplete
- 3+ source rooms: 1 source → controller-supply (closest to controller), rest → spawn-supply
- 1-source rooms: single source is spawn-supply; upgraders free-range via `findClosestByRange`,
  no `sourceId` pinning
- Upgrader count after spawn saturation: grow `+1` at a time (not full saturation formula)
- Builder always maintained at exactly 1

---

## Key Decisions

| Decision | Choice |
|---|---|
| Saturation tracking unit | **WORK-part caps** (Option A): keep `assignedWorkBySource` as WORK-part map; per-source cap = `neededHarvesters × workPerCreep` |
| Harvester target | Stable sum: `sum(neededHarvestersForSource(id))` for spawn-supply sources only |
| Upgrader target | `currentCount + 1` gated by `canSupportAnotherUpgrader` energy-flow check |
| Controller-supply tracking | Separate `upgradersPerSource: Record<string,number>` counter (creep count per source) |
| `SpawnQueueRole.body` | Change from `BodyPartConstant[]` to `(ctx: RoomContext) => BodyPartConstant[]` |

### True saturation formula

```
neededHarvestersForSource(source, workPerCreep) =
  ceil( 5 × cycleTime / (MINE_TIME × workPerCreep) )

cycleTime = 25 + 3 × d        (d = path distance from source to spawn/deposit point)
MINE_TIME  = 25
```

At `d=0` with single body (1 WORK): `ceil(5×25 / (25×1)) = 5` — matches old `SOURCE_WORK_SATURATION`.

### Source classification

- 2 sources: sort by `d_spawn − d_ctrl`; most negative → spawn-supply, most positive → controller-supply
- 3+ sources: closest-to-controller → controller-supply, rest → spawn-supply
- 1 source: all → spawn-supply; upgraders use `findClosestByRange`, no `sourceId` pin

### `canSupportAnotherUpgrader` formula

```
harvestersDepositRate   = sum(WORK parts of all harvesters) × 2   (e/tick)
fleetMaintenanceCost    = sum(body costs of all room creeps) / CREEP_LIFE_TIME   (e/tick)
nextUpgraderBodyCost    = calcBodyCost(selectedWorkerBody)

gate = harvestersDepositRate − fleetMaintenanceCost ≥ nextUpgraderBodyCost / CREEP_LIFE_TIME
```

---

## Files Changed

| File | Nature of change |
|---|---|
| `src/spawner.ts` | Primary — new helpers, updated queues, updated RoomContext |
| `src/tasks/upgrade.ts` | Minor — `sourceId`-pinned source selection |
| `test/unit/spawner.test.ts` | Significant — new globals, mock updates, 1 test removed, 11 new tests |
| `test/unit/upgradeTask.test.ts` | Minor — 1 new test |

---

## `src/spawner.ts` — Step-by-Step

### 1. Constants

```ts
const MINE_TIME = 25;
const DOUBLE_BODY_THRESHOLD = 400;
const CREEP_LIFE_TIME = 1500;
```

### 2. Bodies

```ts
const bodies = {
  // ...existing...
  workerDouble: [WORK, CARRY, MOVE, WORK, CARRY, MOVE] as BodyPartConstant[]
};
```

### 3. Path distance cache

```ts
const pathDistanceCache = new Map<string, number>();

const getPathDistance = (from: RoomPosition, to: RoomPosition, key: string): number => {
  if (pathDistanceCache.has(key)) return pathDistanceCache.get(key)!;
  const result = PathFinder.search(from, { pos: to, range: 1 }, { ignoreCreeps: true });
  const dist = result.incomplete ? from.getRangeTo(to) : result.path.length;
  pathDistanceCache.set(key, dist);
  return dist;
};
```

### 4. Body helpers (export for tests)

```ts
export const calcBodyCost = (body: BodyPartConstant[]): number =>
  body.reduce((sum, part) => sum + BODYPART_COST[part], 0);

export const selectWorkerBody = (room: Room): BodyPartConstant[] =>
  room.energyCapacityAvailable >= DOUBLE_BODY_THRESHOLD
    ? bodies.workerDouble
    : bodies.worker;
```

### 5. Source classification (export for tests)

```ts
export const classifySources = (
  sources: Source[],
  spawnPos: RoomPosition,
  controllerPos: RoomPosition
): { spawnSourceIds: string[]; controllerSourceIds: string[] } => {
  if (sources.length <= 1) {
    return { spawnSourceIds: sources.map(s => s.id), controllerSourceIds: [] };
  }
  const scored = sources.map(s => ({
    id: s.id,
    score: getPathDistance(s.pos, spawnPos, `${s.id}-spawn`)
           - getPathDistance(s.pos, controllerPos, `${s.id}-ctrl`)
  }));
  scored.sort((a, b) => a.score - b.score);
  const controllerSourceId = scored[scored.length - 1].id;
  return {
    spawnSourceIds: scored.slice(0, -1).map(s => s.id),
    controllerSourceIds: [controllerSourceId]
  };
};
```

### 6. Needed harvesters per source (export for tests)

```ts
export const calcNeededHarvestersForSource = (
  source: Source,
  spawnPos: RoomPosition,
  workPerCreep: number
): number => {
  const d = getPathDistance(source.pos, spawnPos, `${source.id}-spawn`);
  const cycleTime = MINE_TIME + 3 * d;      // 25 + 3d
  return Math.ceil((5 * cycleTime) / (MINE_TIME * workPerCreep));
};
```

### 7. RoomContext extensions

```ts
interface RoomContext {
  room: Room;
  sources: Source[];
  assignedWorkBySource: Record<string, number>;
  containerSourceIds: Set<string>;
  stationaryBySource: Record<string, number>;
  // NEW:
  workerBody: BodyPartConstant[];
  spawnSourceIds: string[];
  controllerSourceIds: string[];
  /** WORK-part cap per source (neededHarvesters × workPerCreep) */
  neededWorkCapPerSource: Record<string, number>;
  upgradersPerSource: Record<string, number>;
}
```

### 8. buildRoomContext population

Gets spawn pos via `room.find(FIND_MY_SPAWNS)[0]?.pos`. Calls `classifySources`, computes
`neededWorkCapPerSource`, builds `upgradersPerSource`.

### 9. buildUpgradersPerSource

```ts
const buildUpgradersPerSource = (roomName: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room !== roomName) continue;
    if (creep.memory.role !== "upgrader") continue;
    const sid = creep.memory.sourceId;
    if (sid == null) continue;
    counts[sid] = (counts[sid] ?? 0) + 1;
  }
  return counts;
};
```

### 10. pickLeastSaturatedSource update

Add optional `caps?: Record<string, number>` replacing the hard-coded `SOURCE_WORK_SATURATION`:

```ts
const pickLeastSaturatedSource = (
  ctx: RoomContext,
  eligible?: Source[],
  caps?: Record<string, number>
): string | null => {
  const pool = eligible ?? ctx.sources;
  let bestId: string | null = null;
  let bestWork = Infinity;
  for (const source of pool) {
    const cap = caps?.[source.id] ?? SOURCE_WORK_SATURATION;
    const assigned = ctx.assignedWorkBySource[source.id] ?? 0;
    if (assigned >= cap) continue;
    if (assigned < bestWork) { bestWork = assigned; bestId = source.id; }
  }
  return bestId;
};
```

### 11. pickLeastSaturatedControllerSource

```ts
const pickLeastSaturatedControllerSource = (ctx: RoomContext): string | null => {
  const pool = ctx.sources.filter(s => ctx.controllerSourceIds.includes(s.id));
  if (pool.length === 0) return null;
  let bestId = pool[0].id;
  let bestCount = ctx.upgradersPerSource[bestId] ?? 0;
  for (const s of pool.slice(1)) {
    const c = ctx.upgradersPerSource[s.id] ?? 0;
    if (c < bestCount) { bestCount = c; bestId = s.id; }
  }
  return bestId;
};
```

### 12. areSpawnSourcesSaturated & canSupportAnotherUpgrader (export for tests)

```ts
export const areSpawnSourcesSaturated = (ctx: RoomContext, counts: Record<string, number>): boolean => {
  const harvesterCount = counts.harvester ?? 0;
  const neededTotal = Object.entries(ctx.neededWorkCapPerSource)
    .filter(([id]) => ctx.spawnSourceIds.includes(id))
    .reduce((sum, [, cap]) => sum + Math.ceil(cap / countWorkPartsInBody(ctx.workerBody)), 0);
  return harvesterCount >= neededTotal;
};

export const canSupportAnotherUpgrader = (ctx: RoomContext, counts: Record<string, number>): boolean => {
  if (!areSpawnSourcesSaturated(ctx, counts)) return false;
  // WORK parts currently mining
  const totalWorkParts = Object.values(ctx.assignedWorkBySource).reduce((a, b) => a + b, 0);
  const harvestRate = totalWorkParts * 2; // 2 e/tick per WORK part
  // Fleet maintenance cost
  let fleetCost = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.room !== ctx.room.name) continue;
    fleetCost += calcBodyCost(creep.body.map((p: { type: BodyPartConstant }) => p.type));
  }
  const maintenanceCostPerTick = fleetCost / CREEP_LIFE_TIME;
  const nextUpgraderCostPerTick = calcBodyCost(ctx.workerBody) / CREEP_LIFE_TIME;
  return (harvestRate - maintenanceCostPerTick) >= nextUpgraderCostPerTick;
};
```

### 13. Queue updates

**inactiveQueue harvester**:
```ts
{
  role: "harvester",
  body: ctx => ctx.workerBody,
  namePrefix: "Harvester",
  targetCount: (ctx, counts) => {
    const spawnSources = ctx.sources.filter(s => ctx.spawnSourceIds.includes(s.id));
    const workPerCreep = countWorkPartsInBody(ctx.workerBody);
    return spawnSources.reduce(
      (sum, s) => sum + Math.ceil((ctx.neededWorkCapPerSource[s.id] ?? 0) / workPerCreep), 0
    );
  },
  pickSourceId: ctx => {
    const spawnSources = ctx.sources.filter(s => ctx.spawnSourceIds.includes(s.id));
    return pickLeastSaturatedSource(ctx, spawnSources, ctx.neededWorkCapPerSource);
  }
}
```

**inactiveQueue upgrader**:
```ts
{
  role: "upgrader",
  body: ctx => ctx.workerBody,
  namePrefix: "Upgrader",
  targetCount: (ctx, counts) =>
    canSupportAnotherUpgrader(ctx, counts) ? (counts.upgrader ?? 0) + 1 : Math.min(counts.upgrader ?? 0, 1),
  pickSourceId: ctx =>
    ctx.controllerSourceIds.length > 0 ? pickLeastSaturatedControllerSource(ctx) : null
}
```

Apply analogous changes to **activeQueue** harvester (filter to uncovered spawn-supply sources).

---

## `src/tasks/upgrade.ts` — Change

At line 22, before `findClosestByRange`, check `creep.memory.sourceId`:

```ts
// Pinned source (controller-supply role)
const pinnedId = creep.memory.sourceId;
if (pinnedId != null) {
  const pinned = Game.getObjectById<Source>(pinnedId);
  if (pinned != null) {
    const harvestResult = creep.harvest(pinned);
    if (harvestResult === ERR_NOT_IN_RANGE) creep.moveTo(pinned);
    return false;
  }
}

// Fall back to closest active source (1-source rooms / no pin)
const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
```

---

## `test/unit/spawner.test.ts` — Changes

### New globals in `beforeEach`

```ts
(global as any).FIND_MY_SPAWNS = 3;
(global as any).BODYPART_COST = { work: 100, carry: 50, move: 50 };
(global as any).CREEP_LIFE_TIME = 1500;
(global as any).PathFinder = {
  search: (_from: any, _to: any, _opts: any) => ({ path: [], incomplete: false })
};
```

### Mock updates

- `bareSource` and `makeSource`: add `pos.x`, `pos.y`, `pos.getRangeTo(() => 0)`
- `createMockSpawn` room: add `controller: { pos: { x:0, y:0, getRangeTo: () => 0 } }`, `energyAvailable: 300`, mock `FIND_MY_SPAWNS` in `find()`
- Add `spawn.pos = { x: 0, y: 0, getRangeTo: () => 0 }` to mock spawn

### `createMockPathFinder(distance)` helper

```ts
const createMockPathFinder = (distance: number): any => ({
  search: (_from: any, _to: any, _opts: any) => ({
    path: Array(distance).fill({}),
    incomplete: false
  })
});
```

### Tests to remove

- `"does not spawn when all inactive-queue thresholds are met"` — behavior intentionally changed; upgraders now grow post-saturation

### Tests confirmed unchanged

- `"does not spawn more harvesters once every source is at WORK saturation"` — at d=0 new formula still gives 5 needed harvesters; assertion `role === "builder"` still correct

### 11 new tests

| # | Suite | Description |
|---|---|---|
| 1 | source classification | single source → spawnSourceIds only |
| 2 | source classification | 2 sources → closer to spawn = spawn-supply, closer to ctrl = ctrl-supply |
| 3 | source classification | 3 sources → 1 ctrl-supply, 2 spawn-supply |
| 4 | body selection | single body when `energyCapacityAvailable < 400` |
| 5 | body selection | double body when `energyCapacityAvailable >= 400` |
| 6 | inactive queue | double body used in spawn when capacity sufficient |
| 7 | inactive queue | distance-scaled harvester target (2 needed at d=8.3) |
| 8 | upgrader pinning | upgrader gets `sourceId` set to controller-supply source |
| 9 | upgrader pinning | upgrader `sourceId` picks least-assigned controller source |
| 10 | upgrader growth | spawns second upgrader after spawn-side saturation (energy check passes) |
| 11 | upgrader growth | does not grow upgrader if `canSupportAnotherUpgrader` returns false |

---

## `test/unit/upgradeTask.test.ts` — New Test

**Test 12**: upgrader with `memory.sourceId` set harvests from that specific source, ignoring `findClosestByRange`.

```ts
it("harvests from pinned sourceId when set, ignoring findClosestByRange", () => {
  const pinnedSource = { id: "pinned-src" };
  let harvestTarget: object | null = null;
  let findClosestCalls = 0;

  (global as any).Game.getObjectById = (id: string) =>
    id === "pinned-src" ? pinnedSource : null;

  const creep = {
    memory: { role: "upgrader", room: "W1N1", sourceId: "pinned-src" },
    store: { getUsedCapacity: () => 0 },
    room: { controller: { id: "c1" }, storage: undefined },
    pos: { findClosestByRange: () => { findClosestCalls++; return null; } },
    withdraw: () => 0,
    harvest: (t: object) => { harvestTarget = t; return 0; },
    upgradeController: () => 0,
    moveTo: () => 0
  };

  runUpgradeTask(creep as any);

  assert.strictEqual(harvestTarget, pinnedSource);
  assert.equal(findClosestCalls, 0);
});
```

---

## Verification Sequence

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

All four must exit 0 before the implementation is considered done.
