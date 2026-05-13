import { ErrorMapper } from "utils/ErrorMapper";
import { evaluateTask } from "tasks/evaluator";
import { runTask } from "tasks/runner";
import { runSpawner } from "spawner";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(`Current game tick is ${Game.time}`);

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  runSpawner();

  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];

    if (creep.memory.task == null) {
      creep.memory.task = evaluateTask(creep);
    }

    const done = runTask(creep);
    if (done) {
      // Re-evaluate and store new task; it will execute on the next tick
      creep.memory.task = evaluateTask(creep);
    }
  }
});
