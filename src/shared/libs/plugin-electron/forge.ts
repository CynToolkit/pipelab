import { getBinName, outFolderName } from 'src/constants'
import {
  ActionRunnerData,
  createAction,
  createArray,
  createBooleanParam,
  createNumberParam,
  createPathParam,
  createStringParam,
  fileExists,
  InputsDefinition,
  OutputsDefinition,
  runWithLiveLogs
} from '../plugin-core'
import type { MakeOptions } from '@electron-forge/core'

import { app } from 'electron'

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = 'electron:make'
export const IDPackage = 'electron:package'
export const IDPackageV2 = 'electron:package:v2'
export const IDPreview = 'electron:preview'

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
    value: '' as MakeOptions['arch'],
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
    value: '' as MakeOptions['platform'],
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
          }
        ]
      }
    }
  },
  configuration: {
    label: 'Electron configuration',
    value: undefined as Partial<ElectronAppConfig.Config> | undefined,
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

  electronVersion: createStringParam('', {
    label: 'Electron version',
    description: 'The version of Electron to use',
    required: false
  }),
  customMainCode: createPathParam('', {
    required: false,
    label: 'Custom main code',
    control: {
      type: 'path',
      options: {
        filters: [{ name: 'JavaScript', extensions: ['js'] }]
      },
      label: 'Path to a file containing custom main code'
    }
  }),
  disableAsarPackaging: {
    required: false,
    label: 'Disable ASAR packaging',
    value: true,
    control: {
      type: 'boolean'
    },
    description: 'Whether to disable packaging project files in a single binary or not'
  },
  enableExtraLogging: {
    required: false,
    label: 'Enable extra logging',
    value: false,
    control: {
      type: 'boolean'
    },
    description: 'Whether to enable extra logging of internal tools while bundling'
  },
  clearServiceWorkerOnBoot: {
    required: false,
    label: 'Clear service worker on boot',
    value: false,
    control: {
      type: 'boolean'
    },
    description: 'Whether to clear service worker on boot'
  },
  openDevtoolsOnStart: createBooleanParam(false, {
    label: 'Open devtools on app start',
    required: false,
    description: 'Whether to open devtools on app start'
  }),

  // Flags

  enableInProcessGPU: {
    required: false,
    label: 'Enable in-process GPU',
    description:
      'When enabled, the GPU process runs inside the main browser process instead of a separate one. This can reduce overhead but may lead to instability or crashes if the GPU process fails.',
    value: false,
    control: {
      type: 'boolean'
    }
  },
  enableDisableRendererBackgrounding: {
    required: false,
    description:
      'Enabling this prevents background tabs from being throttled, which can be useful for web apps that need continuous performance.',
    label: 'Disable renderer backgrounding',
    value: false,
    control: {
      type: 'boolean'
    }
  },
  forceHighPerformanceGpu: {
    required: false,
    description:
      'Enabling this forces the app to always use the high-performance GPU, which can improve rendering but may increase power consumption.',
    label: 'Force high performance GPU',
    value: false,
    control: {
      type: 'boolean'
    }
  },

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
  }),

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

export const createPackageProps = (
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
    outputs: outputs
  })
export const createPackageV2Props = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string
) => {
  const { arch, platform } = params
  return createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
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

export const forge = async (
  action: 'make' | 'package',
  appFolder: string | undefined,
  {
    cwd,
    log,
    inputs,
    setOutput,
    paths,
    abortSignal
  }: ActionRunnerData<
    | ReturnType<typeof createMakeProps>
    | ReturnType<typeof createPackageProps>
    | ReturnType<typeof createPreviewProps>
  >,
  completeConfiguration: ElectronAppConfig.Config
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  const { join, basename, delimiter } = await import('node:path')
  const { cp, readFile, writeFile } = await import('node:fs/promises')
  const { arch, platform } = await import('os')
  const { kebabCase } = await import('change-case')

  let detectedRuntime: 'construct' | 'godot' | undefined = undefined

  log('Building electron')

  if (appFolder) {
    const indexExist = await fileExists(join(appFolder, 'index.html'))
    const swExist = await fileExists(join(appFolder, 'sw.js'))
    const offlineJSON = await fileExists(join(appFolder, 'offline.json'))
    const dataJSON = await fileExists(join(appFolder, 'data.json'))
    const scriptsFolder = await fileExists(join(appFolder, 'scripts'))
    const workermainJs = await fileExists(join(appFolder, 'workermain.js'))

    if (!indexExist) {
      throw new Error('The input folder does not contain an index.html file')
    }

    if (swExist || dataJSON || workermainJs || scriptsFolder) {
      detectedRuntime = 'construct'
    }

    console.log('Detected runtime', detectedRuntime)

    if (detectedRuntime === 'construct' && offlineJSON && swExist) {
      throw new Error(
        'Construct runtime detected, please disable offline capabilties when using HTML5 export. Offline is already supported by default.'
      )
    }
  }

  const { assets, unpack } = paths

  // const { fileURLToPath } = await import('url')
  // const __dirname = fileURLToPath(dirname(import.meta.url))
  // const { app } = await import('electron')

  const modulesPath = join(unpack, 'node_modules')

  const pnpm = join(modulesPath, 'pnpm', 'bin', 'pnpm.cjs')

  const destinationFolder = join(cwd, 'build')

  const forge = join(
    destinationFolder,
    'node_modules',
    '@electron-forge',
    'cli',
    'dist',
    'electron-forge.js'
  )

  const templateFolder = join(assets, 'electron', 'template', 'app')

  // copy template to destination
  await cp(templateFolder, destinationFolder, {
    recursive: true,
    filter: (src) => {
      // log('src', src)
      // log('dest', dest)
      return basename(src) !== 'node_modules'
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
    join(destinationFolder, 'config.cjs'),
    `module.exports = ${JSON.stringify(completeConfiguration, undefined, 2)}`,
    'utf8'
  )

  // copy custom main code
  const destinationFile = join(destinationFolder, 'src', 'custom-main.js')
  if (completeConfiguration.customMainCode) {
    await cp(completeConfiguration.customMainCode, destinationFile)
  } else {
    await writeFile(destinationFile, 'console.log("No custom main code provided")', {
      signal: abortSignal
    })
  }

  const shimsPaths = join(assets, 'shims')

  const userData = app.getPath('userData')

  const pnpmHome = join(userData, 'config', 'pnpm')

  const pkgJSONPath = join(destinationFolder, 'package.json')

  const sanitizedName = kebabCase(completeConfiguration.name)

  const pkgJSONContent = await readFile(pkgJSONPath, 'utf8')

  const pkgJSON = JSON.parse(pkgJSONContent)
  log('Setting name to', sanitizedName)
  pkgJSON.name = sanitizedName
  log('Setting productName to', completeConfiguration.name)
  pkgJSON.productName = completeConfiguration.name
  await writeFile(pkgJSONPath, JSON.stringify(pkgJSON, null, 2))

  log('Installing packages')
  await runWithLiveLogs(
    process.execPath,
    [pnpm, 'install', '--prefer-offline'],
    {
      cwd: destinationFolder,
      env: {
        // DEBUG: '*',
        ELECTRON_RUN_AS_NODE: '1',
        PATH: `${shimsPaths}${delimiter}${process.env.PATH}`,
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

  // override electron version
  if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== '') {
    log(`Installing electron@${completeConfiguration.electronVersion}`)
    await runWithLiveLogs(
      process.execPath,
      [pnpm, 'install', `electron@${completeConfiguration.electronVersion}`, '--prefer-offline'],
      {
        cwd: destinationFolder,
        env: {
          // DEBUG: '*',
          ELECTRON_RUN_AS_NODE: '1',
          PATH: `${shimsPaths}${delimiter}${process.env.PATH}`,
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
  }

  const inputPlatform = inputs.platform === '' ? undefined : inputs.platform
  const inputArch = inputs.arch === '' ? undefined : inputs.arch

  try {
    console.log('typeof inputs.platform', typeof inputs.platform)
    const finalPlatform = inputPlatform ?? platform() ?? ''
    console.log('finalPlatform', finalPlatform)
    const finalArch = inputArch ?? arch() ?? ''

    await runWithLiveLogs(
      process.execPath,
      [forge, action, /* '--', */ '--arch', finalArch, '--platform', finalPlatform],
      {
        cwd: destinationFolder,
        env: {
          DEBUG: completeConfiguration.enableExtraLogging ? '*' : '',
          ELECTRON_NO_ASAR: '1',
          ELECTRON_RUN_AS_NODE: '1',
          PATH: `${shimsPaths}${delimiter}${process.env.PATH}`
          // DEBUG: "electron-packager"
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

    if (action === 'package') {
      const outName = outFolderName(
        completeConfiguration.name,
        finalPlatform as NodeJS.Platform,
        finalArch as NodeJS.Architecture
      )
      const binName = getBinName(completeConfiguration.name)

      const output = join(destinationFolder, 'out', outName)
      setOutput('output', output)
      return {
        folder: output,
        binary: join(output, binName)
      }
    } else {
      const output = join(destinationFolder, 'out', 'make')
      setOutput('output', output)
      return {
        folder: output,
        binary: undefined
      }
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
