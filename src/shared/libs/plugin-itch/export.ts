import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  downloadFile,
  runWithLiveLogs
} from '@pipelab/plugin-core'

export const ID = 'itch-upload'

export interface ButlerJSONOutputLog {
  level: 'info'
  message: string
  time: number
  type: 'log'
}

export interface ButlerJSONOutputProgress {
  bps: number
  eta: number
  progress: number
  time: 1736873335
  type: 'progress'
}

export type ButlerJSONOutput = ButlerJSONOutputLog | ButlerJSONOutputProgress

export const uploadToItch = createAction({
  id: ID,
  name: 'Upload to Itch.io',
  description: '',
  icon: '',
  displayString:
    "`Upload ${fmt.param(params['input-folder'], 'primary', 'No path selected')} to ${fmt.param(params['user'], 'primary', 'No project')}/${fmt.param(params['project'], 'primary', 'No project')}:${fmt.param(params['channel'], 'primary', 'No channel')}`",
  meta: {},
  params: {
    'input-folder': createPathParam('', {
      label: 'Folder to Upload',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    }),
    user: createStringParam('', {
      label: 'User',
    }),
    project: createStringParam('', {
      label: 'Project',
    }),
    channel: createStringParam('', {
      label: 'Channel',
    }),
    'api-key': createStringParam('', {
      label: 'API key',
    })
  },
  outputs: {}
})

export const uploadToItchRunner = createActionRunner<typeof uploadToItch>(
  async ({ log, inputs, cwd, abortSignal }) => {
    const { app } = await import('electron')
    const { join, dirname } = await import('node:path')
    const { mkdir, access, chmod } = await import('node:fs/promises')
    const StreamZip = await import('node-stream-zip')

    const userData = app.getPath('userData')

    const itchMetadataPath = join(userData, 'thirdparty', 'itch')
    const butlerTmpZipFile = join(cwd, 'thirdparty', 'itch', 'butler.zip')

    log('butlerTmpZipFile', butlerTmpZipFile)

    // create destination dir
    await mkdir(itchMetadataPath, {
      recursive: true
    })

    // create tmp dir
    await mkdir(dirname(butlerTmpZipFile), {
      recursive: true
    })

    const localOs = process.platform
    const localArch = process.arch

    let butlerName = ''
    if (localOs === 'darwin') {
      butlerName += 'darwin'
    } else if (localOs === 'linux') {
      butlerName += 'linux'
    } else if (localOs === 'win32') {
      butlerName += 'windows'
    }

    butlerName += '-'

    if (localArch === 'x64') {
      butlerName += 'amd64'
    } else {
      throw new Error('Unsupported architecture')
    }

    let extension = ''
    if (localOs === 'win32') {
      extension += '.exe'
    }

    const butlerPath = join(itchMetadataPath, `butler${extension}`)
    console.log('butlerPath', butlerPath)

    let alreadyExist = true

    try {
      await access(butlerPath)
    } catch (e) {
      alreadyExist = false
    }

    const url = `https://broth.itch.zone/butler/${butlerName}/LATEST/archive/default`
    console.log('url', url)

    if (alreadyExist === false) {
      await downloadFile(
        url,
        butlerTmpZipFile,
        {
          onProgress: ({ progress }) => {
            log(`Downloading itch.io butler: ${progress.toFixed(2)}%`)
          }
        },
        abortSignal
      )
      const zip = new StreamZip.default.async({ file: butlerTmpZipFile })

      const bytes = await zip.extract(null, dirname(butlerPath))
      await zip.close()

      log('bytes', bytes)
    }

    await chmod(butlerPath, 0o755)

    log('Uploading to itch')

    await runWithLiveLogs(
      butlerPath,
      [
        'push',
        inputs['input-folder'],
        `${inputs.user}/${inputs.project}:${inputs.channel}`,
        '--json'
      ],
      {
        env: {
          BUTLER_API_KEY: inputs['api-key']
        },
        cancelSignal: abortSignal
      },
      log,
      {
        onStdout(data, subprocess) {
          const jsons = data.trim().split('\n')
          for (const jsonData of jsons) {
            const json = JSON.parse(jsonData) as ButlerJSONOutput
            switch (json.type) {
              case 'log':
                log(json.message)
                break
              case 'progress':
                log(`${json.progress}% - ETA: ${json.eta}s`)
                break
            }
          }
        }
      },
    )

    log('Uploaded to itch')
  }
)
