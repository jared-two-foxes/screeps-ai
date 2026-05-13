import { runDepositTask } from "tasks/deposit";
import { runHarvestTask } from "tasks/harvest";
import { runUpgradeTask } from "tasks/upgrade";

/**
 * Dispatches the creep to its current task runner.
 * Returns true when the task is complete and the caller should re-evaluate.
 * An unknown or missing task is treated as complete to force re-evaluation.
 */
export const runTask = (creep: Creep): boolean => {
  switch (creep.memory.task) {
    case "harvest":
      return runHarvestTask(creep);
    case "deposit":
      return runDepositTask(creep);
    case "upgrade":
      return runUpgradeTask(creep);
    default:
      return true; // missing/unknown task — force re-evaluation
  }
};
