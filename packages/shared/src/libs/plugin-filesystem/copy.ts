import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'

export const ID = 'fs:copy'

export const copy = createAction({
  id: ID,
  name: 'Copy file/folder',
  displayString:
    '`Copy ${fmt.param(params.from, "primary", "Source")} to ${fmt.param(params.to, "primary", "Destination")}`',
  params: {
    from: createPathParam('', {
      label: 'From',
      required: true,
      control: {
        type: 'path',
        options: {
          properties: ['openFile', 'openDirectory']
        }
      }
    }),
    to: createPathParam('', {
      label: 'To',
      required: true,
      control: {
        type: 'path',
        options: {
          properties: ['openFile', 'openDirectory', 'createDirectory', 'promptToCreate']
        }
      }
    }),
    recursive: {
      label: 'Recursive',
      required: true,
      value: true,
      control: {
        type: 'boolean'
      }
    },
    overwrite: {
      label: 'Overwrite',
      required: true,
      value: true,
      control: {
        type: 'boolean'
      }
    },
    cleanup: {
      label: 'Cleanup',
      required: true,
      description: 'Whether to delete the original file/folder',
      value: true,
      control: {
        type: 'boolean'
      }
    }
  },

  outputs: {
    output: {
      label: 'Output',
      value: '',
      description: 'The copied file/folder'
    },
    input: {
      label: 'Input',
      value: '',
      description: 'The original file/folder'
    },
    parentDirectory: {
      label: 'Parent directory',
      value: '',
      description: 'The parent directory of the copied file/folder'
    }
  },
  description: 'Copy a file or a folder from one location to another',
  icon: '',
  meta: {}
})

export const copyRunner = createActionRunner<typeof copy>(async ({ log, inputs, setOutput }) => {
  const { cp, mkdir, rm, stat } = await import('node:fs/promises')
  const { basename, join, dirname } = await import('node:path')
  log('')

  const from = inputs.from
  let to = inputs.to

  let fromIsAFile = false
  try {
    const stats = await stat(from)
    if (stats.isFile()) {
      fromIsAFile = true
    }
  } catch (e) {
    log('Error getting file stats', e)
    throw e
  }
  const fromFileName = fromIsAFile ? basename(from) : ''

  if (!from) {
    log('From', from)
    throw new Error('Missing source')
  }

  if (!to) {
    log('To', to)
    throw new Error('Missing destination')
  }

  // if from is a file, we need to add the file name to the destination
  if (fromIsAFile) {
    to = join(to, fromFileName)
  }

  log('Copying', from, 'to', to, 'recursive', inputs.recursive, 'overwrite', inputs.overwrite)

  if (inputs.cleanup) {
    try {
      log('Cleaning up', to)
      process.noAsar = true
      await rm(to, { recursive: true, force: true, maxRetries: 3 })
      if (!fromIsAFile) {
        await mkdir(to, { recursive: true })
      }
      process.noAsar = false
    } catch (e) {
      log('Error cleaning up file', e)
      throw e
    }
  }

  try {
    process.noAsar = true
    await cp(from, to, {
      recursive: inputs.recursive && !fromIsAFile,
      force: inputs.overwrite
    })
    process.noAsar = false
    setOutput('output', to)
    setOutput('input', from)
    setOutput('parentDirectory', dirname(to))
    log('Copied', from, 'to', to)
  } catch (e) {
    log('Error copying file', e)
    throw e
  }
})
