import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  runWithLiveLogs,
} from '@pipelab/plugin-core'

export const ID = 'fs:run'

export const run = createAction({
  id: ID,
  name: 'Invoke file',
  displayString:
    "`Invoke ${fmt.param(params.command, 'primary')} ${(params.parameters ?? []).map(x => { console.log('x', x); return fmt.param(x) }).join(' ')}`",
  // displayString: displayString,
  params: {
    command: createStringParam('', {
      required: true,
      description: 'The command to run',
      label: 'Command'
    }),
    parameters: {
      required: true,
      description: "The command's parameters",
      label: 'Arguments',
      value: [],
      control: {
        type: 'array',
        options: {
          kind: 'text'
        }
      }
    },
    workingDirectory: createPathParam('', {
      required: false,
      description: 'The directory to run the command in. Default to current task directory',
      label: 'Working directory',
      control: {
        type: 'path',
        options: {
          properties: ['createDirectory', 'openDirectory']
        }
      }
    }),
    stopOnError: {
      required: false,
      description: 'Stop the task if the command fails',
      label: 'Stop on error',
      value: false,
      control: {
        type: 'boolean'
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

    const wd = inputs.workingDirectory ?? process.cwd()
    log(`Working directory: ${wd}`)

    try {
      await runWithLiveLogs(
        inputs.command,
        inputs.parameters,
        {
          cwd: wd,
          cancelSignal: abortSignal
        },
        log,
        {
          onStdout: (data) => {
            stdout += data.toString()
            log(data.toString())
          },
          onStderr: (data) => {
            stderr += data.toString()
            log(data.toString())
          },
          onExit(code) {
            exitCode = code
          }
        }
      )

      setOutput('exitCode', exitCode === undefined ? -1 : exitCode)
      setOutput('stdout', stdout)
      setOutput('stderr', stderr)
      setOutput('duration', durationMs)
      if ((exitCode > 0 || exitCode === undefined) && inputs.stopOnError === true) {
        throw new Error(`Command failed with exit code ${exitCode}`)
      }
    } catch (error) {
      console.log('error', error)
      if (inputs.stopOnError === true) {
        throw error
      } else if (error /*  instanceof ExecaError */) {
        setOutput('exitCode', error.exitCode === undefined ? -1 : error.exitCode)
        setOutput('stdout', error.stdout ?? '')
        setOutput('stderr', error.stderr ?? '')
        setOutput('duration', error.durationMs ?? 0)
      }
    }
  }
)
