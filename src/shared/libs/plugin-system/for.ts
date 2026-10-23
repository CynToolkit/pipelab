import { createLoop, createLoopRunner } from '@pipelab/plugin-core'

export const ID = 'for'

export const forLoop = createLoop({
  id: ID,
  name: "For",
  icon: '',
  description: 'A loop',
  outputs: {
    item: {
      value: undefined as unknown,
      label: 'Item'
    },
  },
  params: {
    value: {
      value: [] as unknown[],
      label: 'Value',
      control: {
        type: 'expression',
        options: {}
      }
    }
  },
  meta: {
    loopindex: 0
  },
  displayString: 'Loop for every element of {{params.value}}',
})

export const ForLoopRunner = createLoopRunner<typeof forLoop>(async ({ log, meta, setMeta, inputs }) => {
  const index = typeof meta?.loopindex === 'number' ? meta.loopindex : 0
  const value: unknown[] = Array.isArray(inputs.value) ? inputs.value : []

  log('index', index)

  setMeta((meta) => {
    return {
      ...meta,
      loopindex: index + 1
    }
  })

  return index < value.length ? 'step' : 'exit'
})
