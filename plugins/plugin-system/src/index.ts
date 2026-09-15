import { createNodeDefinition } from "@pipelab/plugin-core";
import { logAction, logActionRunner } from "./log";
import { manualEvent, manualEvaluator } from "./manual";
import { alertAction, alertActionRunner } from "./alert";
import { promptAction, promptActionRunner } from "./prompt";
import { sleepAction, sleepActionRunner } from "./sleep";

export default createNodeDefinition({
  id: "@pipelab/plugin-system",
  packageName: "@pipelab/plugin-system",
  name: "System",
  description: "Pipelab plugin for running shell commands and system operations",
  icon: { type: "icon", icon: "mdi-cog-outline" },
  isOfficial: true,
  nodes: [
    {
      node: logAction,
      runner: logActionRunner,
    },
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
