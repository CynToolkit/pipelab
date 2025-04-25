import {
  ActionRunnerData,
  createAction,
  createPathParam,
  createStringParam,
  InputsDefinition,
  OutputsDefinition,
  runWithLiveLogs
} from '../plugin-core'
import { detectRuntime } from '@@/plugins'
import { app } from 'electron'
import { dirname } from 'node:path'
import { startTunnel } from 'untun'

export const IDPackage = 'discord:package'
export const IDPreview = 'discord:preview'

const paramsInputFolder = {
  'input-folder': createPathParam('', {
    label: 'Folder to package',
    required: true,
    control: {
      type: 'path',
      options: {
        properties: ['openDirectory']
      }
    }
  })
} satisfies InputsDefinition

// const paramsInputURL = {
//   'input-url': createStringParam('', {
//     label: 'URL to preview',
//     required: true
//   })
// } satisfies InputsDefinition

export const configureParams = {
  name: createStringParam('Pipelab', {
    label: 'Application name',
    description: 'The name of the application',
    required: true
  })
} satisfies InputsDefinition

const outputs = {} satisfies OutputsDefinition

export const createPackageProps = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string,
  advanced?: boolean,
  deprecated?: boolean,
  deprecatedMessage?: string,
  disabled?: false,
  updateAvailable?: boolean
) => {
  return createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
    advanced,
    deprecated,
    deprecatedMessage,
    disabled,
    updateAvailable,
    params: {
      ...paramsInputFolder,
      ...configureParams
    },
    outputs: outputs
  })
}

export const createPreviewProps = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string
) =>
  createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
    params: {
      ...paramsInputFolder,
      ...configureParams,
      customHostname: createStringParam('', {
        required: false,
        label: 'Custom hostname',
        description: 'The hostname to use for the preview'
      })
    },
    outputs: outputs
  })

const createAppServer = async (folder: string) => {
  try {
    const serve = await import('serve-handler')
    const { createServer } = await import('http')

    const server = createServer()

    server.on('request', (req, res) => {
      return serve.default(req, res, {
        maxAge: 0,
        public: folder,
        headers: {
          'bypass-tunnel-reminder': 'false'
        }
      })
    })

    const listen = async () => {
      return new Promise((resolve, reject) => {
        server.listen(40400, '127.0.0.1', () => {
          return resolve(server)
        })
      })
    }

    await listen()
    console.log('listening2')
    console.log('address', server.address)
    const addressRes = server.address()
    console.log('addressRes', addressRes)
    if (addressRes && typeof addressRes !== 'string') {
      return { port: addressRes.port }
    }
    throw new Error('Unable to bind server: adress is not an object')
  } catch (e) {
    console.error(e)
    throw e
  }
}

const createTunnel = async (port: number, subdomain: string) => {
  // const localtunnel = await import('localtunnel')
  // console.log('localtunnel', localtunnel)
  // const tunnel = await localtunnel.default({ port, subdomain })
  // tunnel.on('close', () => {
  //   // tunnels are closed
  // })
  // console.log('tunnel.url', tunnel.url)
  // return tunnel
  // const localtunnel = await import('tunnelmole')
  // console.log('localtunnel', localtunnel)
  // const tunnel = await localtunnel.tunnelmole({ port, domain: subdomain })
  // tunnel.on('close', () => {
  //   // tunnels are closed
  // })
  // console.log('tunnel.url', tunnel)
  // return tunnel
}

export const waitForAbort = (signal: AbortSignal): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      return resolve() // Already aborted
    }

    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }

    signal.addEventListener('abort', onAbort)
  })
}

export const discord = async (
  action: 'package' | 'preview',
  appFolder: string | undefined,
  {
    cwd,
    log,
    inputs,
    setOutput,
    paths,
    abortSignal
  }:
    | ActionRunnerData<ReturnType<typeof createPackageProps>>
    | ActionRunnerData<ReturnType<typeof createPreviewProps>>,
  completeConfiguration: DesktopApp.Config
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  const { join, basename, delimiter } = await import('node:path')
  const { cp, readFile, writeFile } = await import('node:fs/promises')
  const { arch, platform } = await import('os')
  const { kebabCase } = await import('change-case')

  console.log('appFolder', appFolder)

  log('Building discord')

  const runtime = await detectRuntime(appFolder)

  const { assets, unpack, cache, node, pnpm } = paths

  const destinationFolder = join(cwd, 'build')

  const templateFolder = join(assets, 'discord', 'templates', 'nitro-app')

  // copy template to destination
  await cp(templateFolder, destinationFolder, {
    recursive: true,
    filter: (src) => {
      log('src', src)
      // log('dest', dest)
      // TODO: support other oses
      return (
        basename(src) !== 'node_modules' &&
        !src.includes('.nitro') &&
        !src.includes('.output') &&
        !src.includes('.env')
      )
    }
  })

  const placeAppFolder = join(destinationFolder, 'src', 'app')

  // if input is folder, copy folder to destination
  if (appFolder) {
    // copy app to template
    await cp(appFolder, placeAppFolder, {
      recursive: true
    })
  }

  writeFile(
    join(destinationFolder, '.env'),
    `DISCORD_CLIENT_ID=1357217738241736724
DISCORD_CLIENT_SECRET=yJ4vRnzDtKAqg2Le3_Sap2CqHybkTp2U`,
    'utf8'
  )

  const shimsPaths = join(assets, 'shims')

  const userData = app.getPath('userData')

  const pnpmHome = join(userData, 'config', 'pnpm')

  const sanitizedName = kebabCase(completeConfiguration.name)

  // package.json update
  // const pkgJSONPath = join(destinationFolder, 'package.json')
  // const pkgJSONContent = await readFile(pkgJSONPath, 'utf8')
  // const pkgJSON = JSON.parse(pkgJSONContent)
  // log('Setting name to', sanitizedName)
  // pkgJSON.name = sanitizedName
  // log('Setting productName to', completeConfiguration.name)
  // pkgJSON.productName = completeConfiguration.name
  // await writeFile(pkgJSONPath, JSON.stringify(pkgJSON, null, 2))

  // discord.conf.json update
  // const tauriConfJSONPath = join(destinationFolder, 'src-discord', 'discord.conf.json')
  // const tauriConfJSONContent = await readFile(tauriConfJSONPath, 'utf8')
  // const tauriConfJSON = JSON.parse(tauriConfJSONContent)
  // log('Setting productName to', completeConfiguration.name)
  // tauriConfJSON.productName = completeConfiguration.name
  // log('Setting version to', completeConfiguration.appVersion)
  // tauriConfJSON.version = completeConfiguration.appVersion
  // log('Setting identifier to', completeConfiguration.appBundleId)
  // tauriConfJSON.identifier = completeConfiguration.appBundleId
  // log('Setting build.devUrl to', appFolder)
  // tauriConfJSON.build.devUrl = appFolder
  // await writeFile(tauriConfJSONPath, JSON.stringify(tauriConfJSON, null, 2))

  log('Installing packages')
  await runWithLiveLogs(
    node,
    [pnpm, 'install', '--prefer-offline'],
    {
      cwd: destinationFolder,
      env: {
        // DEBUG: '*',
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

  // override discord version
  // if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== '') {
  //   log(`Installing discord@${completeConfiguration.electronVersion}`)
  //   await runWithLiveLogs(
  //     process.execPath,
  //     [pnpm, 'install', `discord@${completeConfiguration.electronVersion}`, '--prefer-offline'],
  //     {
  //       cwd: destinationFolder,
  //       env: {
  //         // DEBUG: '*',
  //         PNPM_HOME: pnpmHome
  //       },
  //       cancelSignal: abortSignal
  //     },
  //     log,
  //     {
  //       onStderr(data) {
  //         log(data)
  //       },
  //       onStdout(data) {
  //         log(data)
  //       }
  //     }
  //   )
  // }

  try {
    if (action === 'preview') {
      const port = 14141

      const modulesPath = join(unpack, 'node_modules')
      const nitro = join(modulesPath, 'nitropack', 'dist', 'cli', 'index.mjs')

      // const nitro = await import('nitropack')

      console.log('nitro', nitro)

      await Promise.allSettled([
        runWithLiveLogs(
          node,
          [nitro, 'dev'],
          {
            cwd: destinationFolder,
            env: {
              // DEBUG: '*',
              PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
              PNPM_HOME: pnpmHome,
              PORT: port.toString()
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
        ),
        (async () => {
          const tunnel = await startTunnel({ port, acceptCloudflareNotice: true })
          console.log('tunnel', tunnel)
          const url = await tunnel.getURL()
          console.log('Public URL:', url)
        })()
      ])

      // const { port } = await createAppServer(placeAppFolder)

      // const tunnel = await createTunnel(port, inputs['customHostname'])

      // await waitForAbort(abortSignal)
    } else {
      throw new Error('TODO')
    }

    if (action === 'package') {
      // const binName = getBinName(completeConfiguration.name)
      // log('cargoOutputPath', cargoOutputPath)
      // setOutput('output', cargoOutputPath)
      // return {
      //   folder: cargoOutputPath,
      //   binary: join(cargoOutputPath, binName)
      // }
    } else if (action === 'preview') {
      // continue
    } else {
      throw new Error('Unsupported action')
      // const output = join(destinationFolder, 'out', 'make')
      // setOutput('output', output)
      // return {
      //   folder: output,
      //   binary: undefined
      // }
    }
  } catch (e) {
    if (e instanceof Error) {
      if (e.name === 'RequestError') {
        log('Request error')
      }
      if (e.name === 'RequestError') {
        log('Request error')
      }
    }
    log(e)
    return undefined
  }
}
