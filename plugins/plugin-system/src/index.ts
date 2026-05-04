import { createNodeDefinition } from "@pipelab/plugin-core";
import { logAction, logActionRunner } from "./log";
// import { branchCondition, branchConditionRunner } from './branch';
// import { forLoop, ForLoopRunner } from './for';
import { manualEvent, manualEvaluator } from "./manual";
import { alertAction, alertActionRunner } from "./alert";
import { promptAction, promptActionRunner } from "./prompt";
import { sleepAction, sleepActionRunner } from "./sleep";

export default createNodeDefinition({
  id: "system",
  description: "System",
  name: "System",
  icon: {
    type: "icon",
    icon: "mdi-cog-outline",
  },
  nodes: [
    {
      node: logAction,
      runner: logActionRunner,
    },
    // {
    //     node: branchCondition,
    //     runner: branchConditionRunner,
    // },
    // {
    //     node: forLoop,
    //     runner: ForLoopRunner
    // },
    {
      node: manualEvent,
      runner: manualEvaluator,
    },
    {
      node: alertAction,
      runner: alertActionRunner,
    },
    {
      node: promptAction,
      runner: promptActionRunner,
    },
    {
      node: sleepAction,
      runner: sleepActionRunner,
    },
  ],
});
