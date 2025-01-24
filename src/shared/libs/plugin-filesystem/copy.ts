import { createAction, createActionRunner } from '@pipelab/plugin-core'

export const ID = 'fs:copy'

export const copy = createAction({
  id: ID,
  name: 'Copy file/folder',
  displayString:
    '`Copy ${fmt.param(params.from, "primary")} to ${fmt.param(params.to, "primary")}`',
  params: {
    from: {
      label: 'From',
      value: '',
      control: {
        type: 'path',
        options: {
          properties: ['openFile', 'openDirectory']
        }
      }
    },
    to: {
      label: 'To',
      value: '',
      control: {
        type: 'path',
        options: {
          properties: ['openFile', 'openDirectory', 'createDirectory', 'promptToCreate']
        }
      }
    },
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

  outputs: {},
  description: 'Copy a file or a folder from one location to another',
  icon: '',
  meta: {}
})

export const copyRunner = createActionRunner<typeof copy>(async ({ log, inputs }) => {
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
      await rm(to, { recursive: true })
      await mkdir(to, { recursive: true })
    } catch (e) {
      log('Error backing up file', e)
    }
  }

  try {
    process.noAsar = true
    await cp(from, to, {
      recursive: inputs.recursive,
      force: inputs.overwrite
    })
    process.noAsar = false
    log('Copied', from, 'to', to)
  } catch (e) {
    log('Error copying file', e)
  }
})
