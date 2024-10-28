import { createAction, createActionRunner } from '@pipelab/plugin-core'

export const ID = 'system:alert'

export type Data = {
  text: string
}

export const alertAction = createAction({
  id: ID,
  name: 'Alert',
  description: 'Alert a message',
  icon: '',
  displayString: "`Alert ${fmt.param(params.message ?? 'No message')}`",
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

export const alertActionRunner = createActionRunner<typeof alertAction>(
  async ({ log, inputs, api, setOutput, browserWindow }) => {
    browserWindow.flashFrame(true)
    //    'cancel' | 'ok'
    const _answer = await api.execute('dialog:alert', {
      message: inputs.message
    })

    if ('content' in _answer) {
      setOutput('answer', _answer.content.toString())
    } else {
      log('error')
    }
  }
)
