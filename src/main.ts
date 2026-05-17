import { ErrorMapper } from "utils/ErrorMapper";
import { updateStats } from "utils/stats";
import { evaluateTask } from "tasks/evaluator";
import { runTask } from "tasks/runner";
import { rebalanceRoles } from "roleManager";
import { clearDistanceCache, runSpawner } from "spawner";

const DISTANCE_CACHE_CLEAR_INTERVAL = 1000;

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(`Current game tick is ${Game.time}`);

  // Periodically clear the distance cache to prevent unbounded memory growth.
  if (Game.time % DISTANCE_CACHE_CLEAR_INTERVAL === 0) {
    clearDistanceCache();
  }

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  updateStats();
  rebalanceRoles();
  runSpawner();

  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];

    if (creep.memory.task == null) {
      creep.memory.task = evaluateTask(creep);
    }

    const done = runTask(creep);
    if (done) {
      // Re-evaluate and immediately execute the new task in the same tick so
      // the creep does not idle for a tick at the source after filling up.
      creep.memory.task = evaluateTask(creep);
      runTask(creep);
    }
  }
});
