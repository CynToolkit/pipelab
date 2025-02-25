import { createAction, createActionRunner, createNumberParam } from '@pipelab/plugin-core'

export const ID = 'system:sleep'

export const sleepAction = createAction({
  id: ID,
  name: 'Wait',
  description: 'Wait for a given time (in milliseconds)',
  icon: '',
  displayString: '`Wait for ${fmt.param(params.duration)}ms`',
  meta: {},
  params: {
    duration: createNumberParam(2000, {
      required: true,
      label: 'Duration',
    })
  },

  outputs: {}
})

const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration))

export const sleepActionRunner = createActionRunner<typeof sleepAction>(async ({ inputs }) => {
  await sleep(inputs.duration)
})
