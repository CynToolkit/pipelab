import { createNodeDefinition } from "@cyn/plugin-core";
import { logAction, logActionRunner } from "./log.js";
import { branchCondition, branchConditionRunner } from "./branch.js";
import { forLoop, ForLoopRunner } from "./for.js";
import { manualEvent, manualEvaluator } from "./manual.js";

export default createNodeDefinition({
    id: 'system',
    description: 'System',
    name: 'System',
    icon: {
        type: "icon",
        icon: 'mdi-cog-outline'
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
            runner: manualEvaluator
        }
    ]
})