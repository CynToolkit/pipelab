import { createNodeDefinition } from '@pipelab/plugin-core'
import { logAction, logActionRunner } from './log.js'
// import { branchCondition, branchConditionRunner } from './branch.js'
// import { forLoop, ForLoopRunner } from './for.js'
import { manualEvent, manualEvaluator } from './manual.js'
import { alertAction, alertActionRunner } from './alert.js'
import { promptAction, promptActionRunner } from './prompt.js'
import { sleepAction, sleepActionRunner } from './sleep.js'

export default createNodeDefinition({
  id: 'system',
  description: 'System',
  name: 'System',
  icon: {
    type: 'icon',
    icon: 'mdi-cog-outline'
  },
  nodes: [
    {
      node: logAction,
      runner: logActionRunner
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
    },
    {
      node: alertAction,
      runner: alertActionRunner
    },
    {
      node: promptAction,
      runner: promptActionRunner
    },
    {
      node: sleepAction,
      runner: sleepActionRunner
    }
  ]
})
