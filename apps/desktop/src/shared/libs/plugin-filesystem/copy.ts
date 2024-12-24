import { createAction, createActionRunner } from '@plugins/plugin-core'

export const ID = 'fs:copy'

export const copy = createAction({
  id: ID,
  name: 'Copy file',
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
    }
  },

  outputs: {},
  description: 'Copy a file or a folder from one location to another',
  icon: '',
  meta: {}
})

export const copyRunner = createActionRunner<typeof copy>(async ({ log, inputs }) => {
  const { cp } = await import('node:fs/promises')
  log('')

  const from = inputs.from
  const to = inputs.to

  if (!from) {
    throw new Error('Missing source')
  }

  if (!to) {
    throw new Error('Missing destination')
  }

  try {
    process.noAsar = true
    await cp(from, to, {
      recursive: inputs.recursive
    })
    process.noAsar = false
  } catch (e) {
    log('Error copying file', e)
  }
})
