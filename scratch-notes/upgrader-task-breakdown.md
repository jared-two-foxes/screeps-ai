# Upgrader Task Breakdown

1. Define upgrader behavior
   - Prefer `room.storage` when it exists and has energy, otherwise harvest the closest source.
   - Use `upgradeController(room.controller)` when in working mode.
   - Follow the same `working` state pattern as harvesters:
     - `working = false` when energy is empty.
     - `working = true` when carry is full.
   - Handle `ERR_NOT_IN_RANGE` by calling `moveTo(...)`.
   - Idle safely if no controller or no usable energy target exists.

2. Add upgrader role controller
   - Create `src/roles/upgrader.ts`.
   - Export `runUpgrader(creep: Creep)` to match the existing `runHarvester` pattern.
   - Implement:
     - gather from storage via `withdraw(..., RESOURCE_ENERGY)` when available
     - otherwise `harvest(...)` from source
     - `upgradeController(...)` when working

3. Update main loop role dispatch
   - Import `runUpgrader` in `src/main.ts`.
   - Add a branch so creeps with `memory.role === "upgrader"` run the upgrader controller.

4. Update creep memory typing
   - Extend `src/types.d.ts`.
   - Keep the `declare global` pattern.
   - Make sure `CreepMemory` supports the upgrader role cleanly.
   - Decide whether `working` should remain required or become optional if older/partial memory should be handled safely.

5. Extend spawn algorithm
   - Update `src/spawner.ts` to count upgraders in addition to harvesters.
   - Define explicit spawn priority:
     - harvesters first until threshold is met
     - then spawn upgraders
   - Keep current spawner behavior:
     - try idle spawns sequentially
     - continue after failed spawn attempts
     - stop after the first successful spawn
   - Initialize upgrader memory as:
     - `role: "upgrader"`
     - `room: spawn.room.name`
     - `working: false`

6. Decide upgrader spawn threshold
   - Pick an explicit upgrader target count.
   - Recommended starting point: `1` upgrader globally, since the current spawner is simple and global.

7. Add unit tests for upgrader behavior
   - Create `test/unit/upgrader.test.ts`.
   - Cover:
     - switches to gathering when empty
     - switches to working when full
     - withdraws from storage when storage has energy
     - falls back to harvesting when storage is missing or empty
     - calls `moveTo` when `withdraw`, `harvest`, or `upgradeController` returns `ERR_NOT_IN_RANGE`
     - idles safely when no controller exists
     - idles safely when no storage energy and no source exist
     - handles undefined `memory.working` safely if that behavior is desired

8. Add unit tests for spawner changes
   - Update `test/unit/spawner.test.ts`.
   - Cover:
     - spawns upgrader once harvester threshold is met
     - does not spawn upgrader when upgrader threshold is already met
     - prioritizes harvester when both roles are below threshold
     - preserves busy-spawn behavior
     - continues to later spawns after a failed spawn attempt
     - stops after the first successful spawn in a tick
     - initializes upgrader memory correctly

9. Add unit test for main loop dispatch
   - Update `test/unit/main.test.ts`.
   - Verify `role === "upgrader"` dispatches to upgrader logic.

10. Verify the full repo sequence
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run build`

## Recommended Order

1. Decide upgrader threshold and undefined-`working` policy.
2. Add upgrader controller.
3. Wire main loop.
4. Update spawner.
5. Add and adjust tests.
6. Run verification.

## Recommendation

- Use an upgrader threshold of `1` globally to start.
