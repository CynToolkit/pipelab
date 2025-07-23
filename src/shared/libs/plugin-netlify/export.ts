import { extractZip, zipFolder } from '@main/utils'
import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  downloadFile,
  runWithLiveLogs
} from '@pipelab/plugin-core'
import { app, shell } from 'electron'
import { createReadStream } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

export const ID = 'netlify-upload'

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

export const uploadToNetlify = createAction({
  id: ID,
  name: 'Upload to Netlify',
  description: '',
  icon: '',
  displayString:
    "`Upload ${fmt.param(params['input-folder'], 'primary', 'No path selected')} to ${fmt.param(params['site'], 'primary', 'No site')}`",
  meta: {},
  params: {
    'input-folder': createPathParam('', {
      required: true,
      label: 'Path to the folder to upload to netlify',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    }),
    token: createStringParam('', {
      required: true,
      label: 'Token'
    }),
    site: createStringParam('', {
      required: true,
      label: 'Site'
    })
  },
  outputs: {}
})

export const uploadToNetlifyRunner = createActionRunner<typeof uploadToNetlify>(
  async ({ log, inputs, cwd, abortSignal, paths }) => {
    log('Uploading to netlify')

    const { pnpm, node } = paths

    const userData = app.getPath('userData')
    const pnpmHome = join(userData, 'config', 'pnpm')

    const sitesResult = await fetch(`https://api.netlify.com/api/v1/sites/${inputs.site}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/zip',
        Authorization: `Bearer ${inputs.token}`
      }
    })
    const site = await sitesResult.json()

    log('site', site)
    if (!site) {
      throw new Error('Site does not exist')
    }

    const buildDir = join(cwd, 'build')

    await cp(inputs['input-folder'], buildDir, {
      recursive: true
    })

    const netlifyDir = join(buildDir, '.netlify')
    const netlifyState = join(netlifyDir, 'state.json')

    await mkdir(netlifyDir, { recursive: true })

    await writeFile(netlifyState, `{ "siteId": "${inputs.site}" }`, 'utf-8')

    shell.openExternal(cwd)

    log('Installing packages')
    await runWithLiveLogs(
      node,
      [pnpm, 'install', '--prefer-offline'],
      {
        cwd: buildDir,
        env: {
          // DEBUG: '*',
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
          PNPM_HOME: pnpmHome
        },
        cancelSignal: abortSignal
      },
      log,
      {
        onStderr(data) {
          log(data)
        },
        onStdout(data) {
          log(data)
        }
      }
    )

    // await runWithLiveLogs(
    //   node,
    //   [pnpm, 'build', '--preset', 'netlify'],
    //   {
    //     cwd: buildDir,
    //     env: {
    //       // DEBUG: '*',
    //       PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
    //       PNPM_HOME: pnpmHome
    //     },
    //     cancelSignal: abortSignal
    //   },
    //   log,
    //   {
    //     onStderr(data) {
    //       log(data)
    //     },
    //     onStdout(data) {
    //       log(data)
    //     }
    //   }
    // )
    await runWithLiveLogs(
      node,
      [pnpm, '--package', 'netlify-cli', 'dlx', 'netlify', 'build'],
      {
        cwd: buildDir,
        env: {
          // DEBUG: '*',
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
          PNPM_HOME: pnpmHome
        },
        cancelSignal: abortSignal
      },
      log,
      {
        onStderr(data) {
          log(data)
        },
        onStdout(data) {
          log(data)
        }
      }
    )

    // const distDir = join(buildDir, 'dist')

    // const distZipPath = join(cwd, 'dist.zip')
    // const zip = await zipFolder(distDir, distZipPath, log)

    // console.log('zip', zip)
    // console.log('distZipPath', distZipPath)

    // const result = await fetch(`https://api.netlify.com/api/v1/sites/${inputs.site}/deploys`, {
    //   method: 'POST',
    //   body: createReadStream(distZipPath),
    //   headers: {
    //     'Content-Type': 'application/zip',
    //     Authorization: `Bearer ${inputs.token}`
    //   },
    //   duplex: 'half'
    // })
    //
    // const deploy = await result.json()

    await runWithLiveLogs(
      node,
      [pnpm, '--package', 'netlify-cli', 'dlx', 'netlify', 'deploy', '--prod'],
      {
        cwd: buildDir,
        env: {
          // DEBUG: '*',
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
          PNPM_HOME: pnpmHome
        },
        cancelSignal: abortSignal
      },
      log,
      {
        onStderr(data) {
          log(data)
        },
        onStdout(data) {
          log(data)
        }
      }
    )

    // log('Deployed to netlify', deploy)

    log('Uploaded to netlify')
  }
)
