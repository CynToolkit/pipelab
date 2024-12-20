import { createAction, createActionRunner } from '@pipelab/plugin-core'
// import displayString from './displayStringRun.lua?raw'

export const ID = 'fs:run'

export const run = createAction({
  id: ID,
  name: 'Invoke file',
  displayString:
    "`Invoke ${fmt.param(params.command, 'primary')} ${(params.parameters ?? []).map(x => { console.log('x', x); return fmt.param(x) }).join(' ')}`",
  // displayString: displayString,
  params: {
    command: {
      description: 'The command to run',
      label: 'Command',
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    parameters: {
      description: "The command's parameters",
      label: 'Arguments',
      value: [],
      control: {
        type: 'array',
        options: {
          kind: 'text'
        }
      }
    }
  },

  outputs: {
    stdout: {
      label: 'Standard output',
      description: 'Standard output of the command',
      value: ''
    },
    stderr: {
      label: 'Error output',
      value: ''
    },
    exitCode: {
      label: 'Exit code',
      value: 0
    },
    duration: {
      label: 'Duration',
      value: 0
    }
  },
  description: 'Invoke an arbitrary executable',
  icon: '',
  meta: {}
})

export const runRunner = createActionRunner<typeof run>(async ({ log, inputs, setOutput }) => {
  const { execa, ExecaError } = await import('execa')

  const str = `${inputs.command} ${inputs.parameters.join(' ')}`

  log(`Running ${str}`)

  try {
    const result = await execa`${str}`

    const { exitCode, durationMs, stderr, stdout } = result

    setOutput('exitCode', exitCode === undefined ? -1 : exitCode)
    setOutput('stdout', stdout)
    setOutput('stderr', stderr)
    setOutput('duration', durationMs)
  } catch (error) {
    if (error instanceof ExecaError) {
      setOutput('exitCode', error.exitCode === undefined ? -1 : error.exitCode)
      setOutput('stdout', error.stdout ?? '')
      setOutput('stderr', error.stderr ?? '')
      setOutput('duration', error.durationMs ?? 0)
    }
  }
})
