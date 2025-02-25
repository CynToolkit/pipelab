import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'

export const ID = 'fs:remove'

export const remove = createAction({
  id: ID,
  name: 'Remove file/folder',
  displayString: '`Remove ${fmt.param(params.from, "primary")}`',
  params: {
    from: createPathParam('', {
      label: 'Path',
      required: true,
      control: {
        type: 'path',
        options: {
          properties: ['openFile']
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
    }
  },

  outputs: {},
  description: 'Remove a file or a folder',
  icon: '',
  meta: {}
})

export const removeRunner = createActionRunner<typeof remove>(async ({ log, inputs }) => {
  const { rm } = await import('node:fs/promises')
  log('')

  const from = inputs.from

  log('Removing', from, inputs.recursive)

  if (!from) {
    log('From', from)
    throw new Error('Missing source')
  }

  try {
    process.noAsar = true
    await rm(from, { recursive: true, force: true, maxRetries: 3 })
    process.noAsar = false
    log('Removed', from)
  } catch (e) {
    log('Error removeing file', e)
    throw e
  }
})
