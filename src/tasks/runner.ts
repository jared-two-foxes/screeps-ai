import { runBuildTask } from "tasks/build";
import { runDepositTask } from "tasks/deposit";
import { runForageTask } from "tasks/forage";
import { runHarvestTask } from "tasks/harvest";
import { runHarvestAndDepositTask } from "tasks/harvestAndDeposit";
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
    case "harvestAndDeposit":
      return runHarvestAndDepositTask(creep);
    case "forage":
      return runForageTask(creep);
    case "build":
      return runBuildTask(creep);
    default:
      return true; // missing/unknown task — force re-evaluation
  }
};
