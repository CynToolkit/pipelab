import { createNodeDefinition } from '@pipelab/plugin-core'
import { ListFilesAction, ListFilesActionRun } from './list-files.js'
import { isFileCondition, isFileRunner } from './is-file.js'
import { zipRunner, zip } from './zip.js'
import { unzipRunner, unzip } from './unzip.js'
import { copy, copyRunner } from './copy.js'
import { remove, removeRunner } from './remove.js'
import { run, runRunner } from './run.js'
import { openInExplorer, openInExplorerRunner } from './open.js'

export default createNodeDefinition({
  description: 'Filesystem',
  id: 'filesystem',
  name: 'Filesystem',
  icon: {
    type: 'icon',
    icon: 'mdi-folder-zip-outline'
  },
  nodes: [
    // {
    //     node: ListFilesAction,
    //     runner: ListFilesActionRun
    // },
    // {
    //     node: isFileCondition,
    //     runner: isFileRunner
    // },
    {
      node: zip,
      runner: zipRunner
    },
    {
      node: unzip,
      runner: unzipRunner
    },
    {
      node: copy,
      runner: copyRunner
    },
    {
      node: remove,
      runner: removeRunner
    },
    {
      node: run,
      runner: runRunner
    },
    {
      node: openInExplorer,
      runner: openInExplorerRunner
    }
  ]
})
