import { createCondition, createConditionRunner, createStringParam } from '@pipelab/plugin-core'

export const ID = 'is-file'

export const isFileCondition = createCondition({
  id: ID,
  icon: '',
  name: 'Is file',
  description: '',
  displayString: '`If ${params.path} is a file`',
  params: {
    path: createStringParam('', {
      label: 'Path',
      required: true
    })
  }
})

export const isFileRunner = createConditionRunner<typeof isFileCondition>(async ({ log, inputs }) => {
  const fs = await import('node:fs/promises')
  const path = inputs.path

  log('path', path)
  const stats = await fs.stat(path)

  return stats.isFile()
})
