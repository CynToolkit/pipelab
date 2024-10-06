import { createAction, createActionRunner } from '@pipelab/plugin-core'

export const ID = 'system:prompt'

export type Data = {
  text: string
}

export const promptAction = createAction({
  id: ID,
  name: 'Prompt',
  description: 'Prompt a message',
  icon: '',
  displayString: "`Prompt ${fmt.param(params.message ?? 'No message')}`",
  meta: {},
  params: {
    message: {
      value: '',
      label: 'Message',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    }
  },

  outputs: {
    answer: {
      label: 'Answer',
      value: ''
    }
  }
})

export const promptActionRunner = createActionRunner<typeof promptAction>(
  async ({ log, inputs, api, setOutput, browserWindow }) => {
    browserWindow.flashFrame(true)
    //    'cancel' | 'ok'
    const _answer = await api.execute('dialog:prompt', {
      message: inputs.message
    })

    console.log('_answer', _answer)

    if ('answer' in _answer) {
      setOutput('answer', _answer.answer)
    } else {
      log('error')
    }
  }
)
