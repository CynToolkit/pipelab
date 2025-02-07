import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'

export const ID = 'fs:copy'

export const copy = createAction({
  id: ID,
  name: 'Copy file/folder',
  displayString:
    '`Copy ${fmt.param(params.from, "primary")} to ${fmt.param(params.to, "primary")}`',
  params: {
    from: createPathParam('', {
      label: 'From',
      control: {
        type: 'path',
        options: {
          properties: ['openFile', 'openDirectory']
        }
      }
    }),
    to: createPathParam('', {
      label: 'To',
      control: {
        type: 'path',
        options: {
          properties: ['openFile', 'openDirectory', 'createDirectory', 'promptToCreate']
        }
      }
    }),
    recursive: {
      label: 'Recursive',
      value: true,
      control: {
        type: 'boolean'
      }
    },
    overwrite: {
      label: 'Overwrite',
      value: true,
      control: {
        type: 'boolean'
      }
    },
    cleanup: {
      label: 'Cleanup',
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
    }
  },
  description: 'Copy a file or a folder from one location to another',
  icon: '',
  meta: {}
})

export const copyRunner = createActionRunner<typeof copy>(async ({ log, inputs, setOutput }) => {
  const { cp, mkdir, rm } = await import('node:fs/promises')
  log('')

  const from = inputs.from
  const to = inputs.to

  log('Copying', from, 'to', to, 'recursive', inputs.recursive, 'overwrite', inputs.overwrite)

  if (!from) {
    log('From', from)
    throw new Error('Missing source')
  }

  if (!to) {
    log('To', to)
    throw new Error('Missing destination')
  }

  if (inputs.cleanup) {
    try {
      log('Cleaning up', to)
      process.noAsar = true
      await rm(to, { recursive: true, force: true, maxRetries: 3 })
      await mkdir(to, { recursive: true })
      process.noAsar = false
    } catch (e) {
      log('Error cleaning up file', e)
      throw e
    }
  }

  try {
    process.noAsar = true
    await cp(from, to, {
      recursive: inputs.recursive,
      force: inputs.overwrite
    })
    process.noAsar = false
    setOutput('output', to)
    setOutput('input', from)
    log('Copied', from, 'to', to)
  } catch (e) {
    log('Error copying file', e)
    throw e
  }
})
