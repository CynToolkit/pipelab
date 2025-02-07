import { createAction, createActionRunner, createStringParam, runWithLiveLogsPTY } from '@pipelab/plugin-core'

export const ID = 'fs:run'

export const run = createAction({
  id: ID,
  name: 'Invoke file',
  displayString:
    "`Invoke ${fmt.param(params.command, 'primary')} ${(params.parameters ?? []).map(x => { console.log('x', x); return fmt.param(x) }).join(' ')}`",
  // displayString: displayString,
  params: {
    command: createStringParam('', {
      description: 'The command to run',
      label: 'Command',
    }),
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

export const runRunner = createActionRunner<typeof run>(
  async ({ log, inputs, setOutput, abortSignal }) => {
    const str = `${inputs.command} ${inputs.parameters.join(' ')}`

    log(`Running ${str}`)

    let stdout: string = ''
    let stderr: string = ''
    let exitCode: number = 0
    const durationMs: number = 0

    try {
      await runWithLiveLogsPTY(inputs.command, inputs.parameters, {}, log, {
        onStdout: (data) => {
          stdout += data.toString()
        },
        onStderr: (data) => {
          stderr += data.toString()
        },
        onExit(code) {
          exitCode = code
        },
        onCreated(subprocess) {
          abortSignal.addEventListener('abort', () => {
            subprocess.kill()
          })
        }
      })

      setOutput('exitCode', exitCode === undefined ? -1 : exitCode)
      setOutput('stdout', stdout)
      setOutput('stderr', stderr)
      setOutput('duration', durationMs)
    } catch (error) {
      console.log('error', error)
      if (error /*  instanceof ExecaError */) {
        setOutput('exitCode', error.exitCode === undefined ? -1 : error.exitCode)
        setOutput('stdout', error.stdout ?? '')
        setOutput('stderr', error.stderr ?? '')
        setOutput('duration', error.durationMs ?? 0)
      }
    }
  }
)
