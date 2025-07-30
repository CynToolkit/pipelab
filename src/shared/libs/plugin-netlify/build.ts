import { ensure, extractZip, zipFolder } from '@main/utils'
import {
  createAction,
  createActionRunner,
  createNetlifySiteParam,
  createPathParam,
  createStringParam,
  downloadFile,
  fileExists,
  runWithLiveLogs
} from '@pipelab/plugin-core'
import { app, shell } from 'electron'
import { createReadStream } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

export const ID = 'netlify-build'

export const buildNetlifySite = createAction({
  id: ID,
  name: 'Build Netlify site',
  description: '',
  icon: '',
  displayString: "`Build ${fmt.param(params['input-folder'], 'primary', 'No path selected')}`",
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
    })
  },
  outputs: {}
})

export const buildNetlifySiteRunner = createActionRunner<typeof buildNetlifySite>(
  async ({ log, inputs, cwd, abortSignal, paths }) => {
    log('Building netlify site')

    const { pnpm, node } = paths

    const userData = app.getPath('userData')
    const pnpmHome = join(userData, 'config', 'pnpm')

    const buildDir = join(cwd, 'build')

    const inputFolder = inputs['input-folder']
    // ensure input folder have apackage.json
    const packageJsonPath = join(inputFolder, 'package.json')
    const packageJson = await fileExists(packageJsonPath)
    if (!packageJson) {
      throw new Error('No package.json found in input folder')
    }

    await cp(inputs['input-folder'], buildDir, {
      recursive: true
    })

    const netlifyDir = join(buildDir, '.netlify')
    const netlifyState = join(netlifyDir, 'state.json')

    await mkdir(netlifyDir, { recursive: true })

    await writeFile(netlifyState, `{ "siteId": "${inputs.site}" }`, 'utf-8')

    // log('Installing packages')
    // await runWithLiveLogs(
    //   node,
    //   [pnpm, 'install', '--prefer-offline'],
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
          PNPM_HOME: pnpmHome,
          NETLIFY_AUTH_TOKEN: inputs.token
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
          PNPM_HOME: pnpmHome,
          NETLIFY_AUTH_TOKEN: inputs.token
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
