import { getBinName } from 'src/constants'
import {
  ActionRunnerData,
  createAction,
  createArray,
  createBooleanParam,
  createNumberParam,
  createPathParam,
  createStringParam,
  InputsDefinition,
  OutputsDefinition,
  runWithLiveLogs
} from '../plugin-core'
import { detectRuntime } from '@@/plugins'
import { app } from 'electron'
import { dirname } from 'node:path'

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = 'tauri:make'
export const IDPackageV2 = 'tauri:package:v2'
export const IDPreview = 'tauri:preview'

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

const paramsInputURL = {
  'input-url': createStringParam('', {
    label: 'URL to preview',
    required: true
  })
} satisfies InputsDefinition

const params = {
  arch: {
    value: '' as NodeJS.Architecture | '', // MakeOptions['arch'],
    label: 'Architecture',
    required: false,
    control: {
      type: 'select',
      options: {
        placeholder: 'Architecture',
        options: [
          {
            label: 'Older PCs (ia32)',
            value: 'ia32'
          },
          {
            label: 'Modern PCs (x64)',
            value: 'x64'
          },
          {
            label: 'Older Mobile/Pi (armv7l)',
            value: 'armv7l'
          },
          {
            label: 'New Mobile/Apple Silicon (arm64)',
            value: 'arm64'
          },
          {
            label: 'Mac Universal (universal)',
            value: 'universal'
          },
          {
            label: 'Special Systems (mips64el)',
            value: 'mips64el'
          }
        ]
      }
    }
  },
  platform: {
    value: '' as NodeJS.Platform | '', // MakeOptions['platform'],
    label: 'Platform',
    required: false,
    control: {
      type: 'select',
      options: {
        placeholder: 'Platform',
        options: [
          {
            label: 'Windows (win32)',
            value: 'win32'
          },
          {
            label: 'macOS (darwin)',
            value: 'darwin'
          },
          {
            label: 'Linux (linux)',
            value: 'linux'
          },
          {
            label: 'Android',
            value: 'android'
          },
          {
            label: 'iOS',
            value: 'ios'
          }
        ]
      }
    }
  },
  configuration: {
    label: 'Tauri configuration',
    value: undefined as Partial<DesktopApp.Tauri> | undefined,
    required: true,
    control: {
      type: 'json'
    }
  }
} satisfies InputsDefinition

export const configureParams = {
  name: createStringParam('Pipelab', {
    label: 'Application name',
    description: 'The name of the application',
    required: true
  }),
  appBundleId: createStringParam('com.pipelab.app', {
    label: 'Application bundle ID',
    description: 'The bundle ID of the application',
    required: true
  }),
  appCopyright: createStringParam('Copyright © 2024 Pipelab', {
    label: 'Application copyright',
    description: 'The copyright of the application',
    required: false
  }),
  appVersion: createStringParam('1.0.0', {
    label: 'Application version',
    description: 'The version of the application',
    required: true
  }),
  icon: createPathParam('', {
    label: 'Application icon',
    description: 'The icon of the application. macOS: .icns. Windows: .ico',
    required: false,
    control: {
      type: 'path',
      options: {
        filters: [
          { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'icns'] }
        ]
      },
      label: 'Path to an image file'
    }
  }),
  author: createStringParam('Pipelab', {
    label: 'Application author',
    description: 'The author of the application',
    required: true
  }),
  description: createStringParam('A simple Electron application', {
    label: 'Application description',
    description: 'The description of the application',
    required: false
  }),

  appCategoryType: createStringParam('public.app-category.developer-tools', {
    platforms: ['darwin'],
    label: 'Application category type',
    description: 'The category type of the application',
    required: false
  }),

  // window
  width: createNumberParam(800, {
    label: 'Window width',
    description: 'The width of the window',
    required: false
  }),
  height: createNumberParam(600, {
    label: 'Window height',
    description: 'The height of the window',
    required: false
  }),
  fullscreen: {
    label: 'Fullscreen',
    value: false,
    description: 'Whether to start the application in fullscreen mode',
    required: false,
    control: {
      type: 'boolean'
    }
  },
  frame: {
    label: 'Frame',
    value: true,
    description: 'Whether to show the window frame',
    required: false,
    control: {
      type: 'boolean'
    }
  },
  transparent: {
    label: 'Transparent',
    value: false,
    description: 'Whether to make the window transparent',
    required: false,
    control: {
      type: 'boolean'
    }
  },
  toolbar: {
    label: 'Toolbar',
    value: true,
    description: 'Whether to show the toolbar',
    required: false,
    control: {
      type: 'boolean'
    }
  },
  alwaysOnTop: {
    label: 'Always on top',
    value: false,
    description: 'Whether to always keep the window on top',
    required: false,
    control: {
      type: 'boolean'
    }
  },

  tauriVersion: createStringParam('', {
    label: 'Tauri version',
    description:
      'The version of Tauri to use. If no version specified, it will use the latest one.',
    required: false
  }),
  enableExtraLogging: {
    required: false,
    label: 'Enable extra logging',
    value: false,
    control: {
      type: 'boolean'
    },
    description: 'Whether to enable extra logging of internal tools while bundling'
  },
  openDevtoolsOnStart: createBooleanParam(false, {
    label: 'Open devtools on app start',
    required: false,
    description: 'Whether to open devtools on app start'
  }),

  // websocket apis
  websocketApi: {
    required: false,
    label: 'WebSocket APIs to allow (empty = all)',
    value: '[]',
    control: {
      type: 'array',
      options: {
        kind: 'text'
      }
    }
  },
  ignore: createArray<(string | RegExp)[]>(
    `[
  // use 'src/app/' as starting point
]`,
    {
      required: false,
      label: 'Folders to ignore',
      description:
        'An array of string or Regex that allow ignoring certain files or folders from being packaged',
      control: {
        type: 'array',
        options: {
          kind: 'text'
        }
      }
    }
  ),

  // integrations

  enableSteamSupport: {
    required: false,
    label: 'Enable steam support',
    description: 'Whether to enable Steam support',
    value: false,
    control: {
      type: 'boolean'
    }
  },
  steamGameId: createNumberParam(480, {
    required: false,
    label: 'Steam game ID',
    description: 'The Steam game ID'
  }),
  enableDiscordSupport: {
    required: false,
    label: 'Enable Discord support',
    description: 'Whether to enable Discord support',
    value: false,
    control: {
      type: 'boolean'
    }
  },
  discordAppId: createStringParam('', {
    required: false,
    label: 'Discord application ID',
    description: 'The Discord application ID'
  })
} satisfies InputsDefinition

const outputs = {
  output: {
    label: 'Output',
    value: '',
    control: {
      type: 'path',
      options: {
        properties: ['openDirectory']
      }
    }
  }
} satisfies OutputsDefinition

// type Inputs = ParamsToInput<typeof params>

export const createMakeProps = (
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
      ...params,
      ...paramsInputFolder
    },
    outputs
  })

export const createPackageV2Props = (
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
  const { arch, platform } = params
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
      arch,
      platform,
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
      ...params,
      ...paramsInputURL
    },
    outputs: outputs
  })

export const tauri = async (
  action: 'make' | 'package' | 'preview',
  appFolder: string | undefined,
  {
    cwd,
    log,
    inputs,
    setOutput,
    paths,
    abortSignal
  }: ActionRunnerData<ReturnType<typeof createPackageV2Props>>,
  completeConfiguration: DesktopApp.Config
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  const { join, basename, delimiter } = await import('node:path')
  const { cp, readFile, writeFile } = await import('node:fs/promises')
  const { arch, platform } = await import('os')
  const { kebabCase } = await import('change-case')

  console.log('appFolder', appFolder)

  log('Building tauri')

  if (action !== 'preview') {
    await detectRuntime(appFolder)
  }

  const { assets, unpack, cache, node, pnpm } = paths

  const destinationFolder = join(cwd, 'build')

  const templateFolder = join(assets, 'tauri', 'template', 'app')

  // copy template to destination
  await cp(templateFolder, destinationFolder, {
    recursive: true,
    filter: (src) => {
      log('src', src)
      // log('dest', dest)
      // TODO: support other oses
      return (
        basename(src) !== 'node_modules' &&
        !src.includes('src-tauri\\target') &&
        !src.includes('src-tauri\\gen')
      )
    }
  })

  const placeAppFolder = join(destinationFolder, 'src', 'app')

  // if input is folder, copy folder to destination
  if (appFolder && action !== 'preview') {
    // copy app to template
    await cp(appFolder, placeAppFolder, {
      recursive: true
    })
  }

  writeFile(
    join(destinationFolder, 'config.cjs'),
    `module.exports = ${JSON.stringify(completeConfiguration, undefined, 2)}`,
    'utf8'
  )

  const shimsPaths = join(assets, 'shims')

  const userData = app.getPath('userData')

  const pnpmHome = join(userData, 'config', 'pnpm')

  const sanitizedName = kebabCase(completeConfiguration.name)

  // package.json update
  const pkgJSONPath = join(destinationFolder, 'package.json')
  const pkgJSONContent = await readFile(pkgJSONPath, 'utf8')
  const pkgJSON = JSON.parse(pkgJSONContent)
  log('Setting name to', sanitizedName)
  pkgJSON.name = sanitizedName
  log('Setting productName to', completeConfiguration.name)
  pkgJSON.productName = completeConfiguration.name
  await writeFile(pkgJSONPath, JSON.stringify(pkgJSON, null, 2))

  // tauri.conf.json update
  const tauriConfJSONPath = join(destinationFolder, 'src-tauri', 'tauri.conf.json')
  const tauriConfJSONContent = await readFile(tauriConfJSONPath, 'utf8')
  const tauriConfJSON = JSON.parse(tauriConfJSONContent)
  log('Setting productName to', completeConfiguration.name)
  tauriConfJSON.productName = completeConfiguration.name
  log('Setting version to', completeConfiguration.appVersion)
  tauriConfJSON.version = completeConfiguration.appVersion
  log('Setting identifier to', completeConfiguration.appBundleId)
  tauriConfJSON.identifier = completeConfiguration.appBundleId
  if (action === 'preview') {
    log('Setting build.devUrl to', appFolder)
    tauriConfJSON.build.devUrl = appFolder
    await writeFile(tauriConfJSONPath, JSON.stringify(tauriConfJSON, null, 2))
  } else {
    log('Setting build.frontendDist to', appFolder)
    tauriConfJSON.build.frontendDist = appFolder
    await writeFile(tauriConfJSONPath, JSON.stringify(tauriConfJSON, null, 2))
  }

  log('Installing packages')
  await runWithLiveLogs(
    node,
    [pnpm, 'install', '--prefer-offline'],
    {
      cwd: destinationFolder,
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

  // override tauri version
  // if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== '') {
  //   log(`Installing tauri@${completeConfiguration.electronVersion}`)
  //   await runWithLiveLogs(
  //     process.execPath,
  //     [pnpm, 'install', `tauri@${completeConfiguration.electronVersion}`, '--prefer-offline'],
  //     {
  //       cwd: destinationFolder,
  //       env: {
  //         // DEBUG: '*',
  //         PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
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

  const inputPlatform = inputs.platform === '' ? undefined : inputs.platform
  const inputArch = inputs.arch === '' ? undefined : inputs.arch

  try {
    log('typeof inputs.platform', typeof inputs.platform)
    const finalPlatform: NodeJS.Platform = inputPlatform ?? platform()
    log('finalPlatform', finalPlatform)
    const finalArch: NodeJS.Architecture = inputArch ?? (arch() as NodeJS.Architecture)
    log('finalArch', finalArch)

    let tauriPlatform = ''
    if (finalPlatform === 'win32') {
      tauriPlatform = 'pc-windows-msvc'
    } else if (finalPlatform === 'linux') {
      tauriPlatform = 'unknown-linux-gnu'
    } else {
      throw new Error('Unsupported platform')
    }

    let tauriArch = ''
    if (finalArch === 'x64') {
      tauriArch = 'x86_64'
    } else {
      throw new Error('Unsupported arch')
    }

    const target = `${tauriArch}-${tauriPlatform}`

    const cargoBinName = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

    const home = app.getPath('home')
    const cargoDir = join(home, '.cargo')
    const cargoBinDir = join(cargoDir, 'bin')
    const cargo = join(cargoBinDir, cargoBinName)

    log('cargoDir', cargoDir)
    log('cargoBinDir', cargoBinDir)
    console.log('cargo', cargo)

    log('destinationFolder', destinationFolder)

    const cargoTargetDir = join(cache, 'cargo', 'target', completeConfiguration.appBundleId)
    const cargoOutputPath = join(cargoTargetDir, target, 'release')

    await runWithLiveLogs(
      cargo,
      ['install', 'tauri-cli', '--version', '^2.0.0', '--locked'],
      {
        cwd: join(destinationFolder, 'src-tauri'),
        env: {
          DEBUG: completeConfiguration.enableExtraLogging ? '*' : '',
          ELECTRON_NO_ASAR: '1',
          CARGO_TARGET_DIR: cargoTargetDir,
          PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`
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

    if (action === 'preview') {
      await runWithLiveLogs(
        cargo,
        ['tauri', 'dev', '--target', target],
        {
          cwd: join(destinationFolder, 'src-tauri'),
          env: {
            DEBUG: completeConfiguration.enableExtraLogging ? '*' : '',
            ELECTRON_NO_ASAR: '1',
            // CARGO_TARGET_DIR: cargoTargetDir,
            PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`
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
    } else {
      await runWithLiveLogs(
        cargo,
        ['tauri', 'build', '--target', target, '--no-bundle'],
        {
          cwd: join(destinationFolder, 'src-tauri'),
          env: {
            DEBUG: completeConfiguration.enableExtraLogging ? '*' : '',
            ELECTRON_NO_ASAR: '1',
            // CARGO_TARGET_DIR: cargoTargetDir,
            PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`
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

      await runWithLiveLogs(
        cargo,
        ['tauri', 'bundle', 'appimage,deb,msi,dmg'],
        {
          cwd: join(destinationFolder, 'src-tauri'),
          env: {
            DEBUG: completeConfiguration.enableExtraLogging ? '*' : '',
            ELECTRON_NO_ASAR: '1',
            // CARGO_TARGET_DIR: cargoTargetDir,
            PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`
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
    }

    if (action === 'package') {
      const binName = getBinName(completeConfiguration.name)

      log('cargoOutputPath', cargoOutputPath)

      setOutput('output', cargoOutputPath)
      return {
        folder: cargoOutputPath,
        binary: join(cargoOutputPath, binName)
      }
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
