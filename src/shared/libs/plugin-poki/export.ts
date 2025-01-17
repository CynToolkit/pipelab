import { createAction, createActionRunner, runWithLiveLogs } from '@pipelab/plugin-core'

export const ID = 'poki-upload'

export const uploadToPoki = createAction({
  id: ID,
  name: 'Upload to Poki.io',
  description: '',
  icon: '',
  displayString:
    "`Upload ${fmt.param(params['input-folder'], 'primary', 'No path selected')} to ${fmt.param(params['user'], 'primary', 'No project')}/${fmt.param(params['project'], 'primary', 'No project')}:${fmt.param(params['channel'], 'primary', 'No channel')}`",
  meta: {},
  params: {
    'input-folder': {
      label: 'Folder to Upload',
      value: '',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    },
    project: {
      label: 'Project',
      description: 'This is you Poki game id',
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    name: {
      label: 'Version name',
      description: 'This is the name of the version',
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    notes: {
      label: 'Version notes',
      description: 'These are notes you want to specify with  your version',
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    }
  },
  outputs: {}
})

export const uploadToPokiRunner = createActionRunner<typeof uploadToPoki>(
  async ({ log, inputs, cwd, paths }) => {
    const { app } = await import('electron')
    const { join, dirname } = await import('node:path')
    const { mkdir, access, chmod, writeFile } = await import('node:fs/promises')

    const { unpack } = paths
    const modulesPath = join(unpack, 'node_modules')
    const poki = join(modulesPath, '@poki', 'cli', 'bin', 'index.js')

    const pokiJsonPath = join(inputs['input-folder'], 'poki.json')

    // create file at the same place the folder to upload
    await writeFile(
      pokiJsonPath,
      JSON.stringify(
        {
          game_id: inputs.project,
          build_dir: '.'
        },
        undefined,
        2
      ),
      'utf-8'
    )

    // TODO: needs auth

    await runWithLiveLogs(
      poki,
      ['upload', '--name', inputs.name, '--notes', inputs.notes],
      {
        cwd: inputs['input-folder']
      },
      log,
      {
        onStderr(data, subprocess) {
          log(data)
        },
        onStdout(data, subprocess) {
          log(data)
        }
      }
    )

    /*
      {
        "game_id": "c7bfd2ba-e23b-486f-9504-a6f196cb44df",
        "build_dir": "dist"
      }
      npx @poki/cli upload --name "$(git rev-parse --short HEAD)" --notes "$(git log -1 --pretty=%B)"
    */

    log('Uploaded to poki')
  }
)
