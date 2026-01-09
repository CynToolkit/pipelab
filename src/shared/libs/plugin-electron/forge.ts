import { getBinName, outFolderName } from 'src/constants'
import {
  ActionRunnerData,
  createAction,
  createArray,
  createBooleanParam,
  createColorPicker,
  createNumberParam,
  createPathParam,
  createStringParam,
  InputsDefinition,
  OutputsDefinition,
  runWithLiveLogs
} from '../plugin-core'

import { app } from 'electron'
import { detectRuntime } from '@@/plugins'
import { dirname } from 'node:path'
import * as esbuild from 'esbuild'

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = 'electron:make'
export const IDPackage = 'electron:package'
export const IDPackageV2 = 'electron:package:v2'
export const IDPackageV3 = 'electron:package:v3'
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
          }
        ]
      }
    }
  },
  configuration: {
    label: 'Electron configuration',
    value: undefined as Partial<DesktopApp.Electron> | undefined,
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
  customPackages: createArray<string[]>(
    `[
  // e.g. "lodash" or "express@4.17.1"
]`,
    {
      label: 'Custom npm packages',
      description:
        'A list of additional npm packages to install (format: "package" or "package@version")',
      required: false,
      control: {
        type: 'array',
        options: {
          kind: 'text'
        }
      }
    }
  ),

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

  backgroundColor: createColorPicker('#ffffff', {
    label: 'Background Color',
    description: 'The background color of the window',
    required: false
  }),

  electronVersion: createStringParam('', {
    label: 'Electron version',
    description:
      'The version of Electron to use. If no version specified, it will use the latest one.',
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
  enableDoctor: createBooleanParam(true, {
    required: false,
    label: 'Enable doctor file',
    description:
      'Whether to include the doctor.bat file in Windows builds for prerequisite checking and app launching'
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
) =>
  createAction({
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

export const forge = async (
  action: 'make' | 'package' | 'preview',
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
    | ReturnType<typeof createPackageV2Props>
    | ReturnType<typeof createPreviewProps>
  >,
  completeConfiguration: DesktopApp.Electron
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  const { join, basename, delimiter } = await import('node:path')
  const { cp, readFile, writeFile, rm } = await import('node:fs/promises')
  const { arch, platform } = await import('os')
  const { kebabCase } = await import('change-case')
  const semver = (await import('semver')).default

  log('Building electron')

  if (action !== 'preview') {
    await detectRuntime(appFolder)
  }

  const { assets, unpack, node } = paths

  console.log('assets', assets)

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
  console.log('templateFolder', templateFolder)
  console.log('destinationFolder', destinationFolder)

  // copy template to destination
  await cp(templateFolder, destinationFolder, {
    recursive: true,
    filter: (src) => {
      // console.log('src', src)
      // console.log('dest', dest)
      return basename(src) !== 'node_modules'
    }
  })

  console.log('copy done')

  const pkgJSONPath = join(destinationFolder, 'package.json')
  const pkgJSONContent = await readFile(pkgJSONPath, 'utf8')
  const userData = app.getPath('userData')
  const pnpmHome = join(userData, 'config', 'pnpm')
  const sanitizedName = kebabCase(completeConfiguration.name)

  const originalIconPath = completeConfiguration.icon
  const hasIcon = completeConfiguration.icon !== undefined && completeConfiguration.icon !== ''
  const iconFilename = hasIcon ? basename(completeConfiguration.icon) : ''
  const newIconPath = hasIcon ? join(destinationFolder, iconFilename) : ''
  const relativeIconPath = hasIcon ? join('./', 'build', iconFilename) : ''
  const relativeIconPath1 = hasIcon ? join('./', iconFilename) : ''

  log('relativeIconPath', relativeIconPath)
  log('relativeIconPath1', relativeIconPath1)

  const hasElectronVersion =
    completeConfiguration.electronVersion !== undefined &&
    completeConfiguration.electronVersion !== ''
  const isCJSOnly =
    hasElectronVersion &&
    semver.lt(semver.coerce(completeConfiguration.electronVersion) || '0.0.0', '28.0.0')

  const pkgJSON = JSON.parse(pkgJSONContent)
  log('Setting name to', sanitizedName)
  pkgJSON.name = sanitizedName
  log('Setting productName to', completeConfiguration.name)
  pkgJSON.productName = completeConfiguration.name

  completeConfiguration.icon = relativeIconPath1

  writeFile(
    join(destinationFolder, 'config.cjs'),
    `module.exports = ${JSON.stringify(completeConfiguration, undefined, 2)}`,
    'utf8'
  )

  if (isCJSOnly) {
    log('Setting type to', 'commonjs')
    pkgJSON.type = 'commonjs'
  } else {
    log('Setting type to', 'module')
    pkgJSON.type = 'module'
  }

  await writeFile(pkgJSONPath, JSON.stringify(pkgJSON, null, 2))

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

  console.log('done install')

  // install user-defined custom packages
  if (
    Array.isArray(completeConfiguration.customPackages) &&
    completeConfiguration.customPackages.length > 0
  ) {
    log(`Installing custom packages: ${completeConfiguration.customPackages.join(', ')}`)
    await runWithLiveLogs(
      node,
      [pnpm, 'install', ...completeConfiguration.customPackages, '--prefer-offline'],
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
  }

  // override electron version
  if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== '') {
    log(`Installing electron@${completeConfiguration.electronVersion}`)
    await runWithLiveLogs(
      node,
      [pnpm, 'install', `electron@${completeConfiguration.electronVersion}`, '--prefer-offline'],
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
  }

  if (isCJSOnly) {
    log(`Installing execa@8`)
    await runWithLiveLogs(
      node,
      [pnpm, 'install', `execa@8`, '--prefer-offline'],
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
  }

  console.log('completeConfiguration.icon', completeConfiguration.icon)

  // copy icon
  if (hasIcon) {
    await cp(originalIconPath, newIconPath)
  }

  // copy custom main code
  const destinationFile = join(destinationFolder, 'src', 'custom-main.js')
  if (completeConfiguration.customMainCode) {
    await cp(completeConfiguration.customMainCode, destinationFile)
  } else {
    await writeFile(destinationFile, 'console.log("No custom main code provided")', {
      signal: abortSignal
    })
  }

  if (isCJSOnly) {
    /* ESBUILD transpilation */
    const external = [
      'electron',
      '@pipelab/steamworks.js',
      'electron',
      'node:*',
      'http',
      'node:stream'
    ]
    await esbuild.build({
      entryPoints: [join(destinationFolder, 'src', 'index.js')],
      bundle: true,
      write: true,
      format: 'cjs',
      platform: 'node',
      external,
      outfile: join(destinationFolder, 'dist', 'index.js')
    })
    await esbuild.build({
      entryPoints: [join(destinationFolder, 'src', 'preload.js')],
      bundle: true,
      platform: 'node',
      external,
      format: 'cjs',
      write: true,
      outfile: join(destinationFolder, 'dist', 'preload.js')
    })
    await esbuild.build({
      entryPoints: [join(destinationFolder, 'src', 'custom-main.js')],
      bundle: true,
      platform: 'node',
      external,
      format: 'cjs',
      write: true,
      outfile: join(destinationFolder, 'dist', 'custom-main.js')
    })
    await rm(join(destinationFolder, 'src'), { recursive: true })
    await cp(join(destinationFolder, 'dist'), join(destinationFolder, 'src'), {
      recursive: true
    })
    await rm(join(destinationFolder, 'dist'), { recursive: true })
    /* ESBUILD transpilation */
  }

  const placeAppFolder = join(destinationFolder, 'src', 'app')

  // if input is folder, copy folder to destination
  if (appFolder && action !== 'preview') {
    // copy app to template
    await cp(appFolder, placeAppFolder, {
      recursive: true
    })
  }

  const inputPlatform = inputs.platform === '' ? undefined : inputs.platform
  const inputArch = inputs.arch === '' ? undefined : inputs.arch

  try {
    log('typeof inputs.platform', typeof inputs.platform)
    const finalPlatform = inputPlatform ?? platform() ?? ''
    log('finalPlatform', finalPlatform)
    const finalArch = inputArch ?? arch() ?? ''

    await runWithLiveLogs(
      node,
      [forge, action, /* '--', */ '--arch', finalArch, '--platform', finalPlatform],
      {
        cwd: destinationFolder,
        env: {
          DEBUG: completeConfiguration.enableExtraLogging ? '*' : '',
          ELECTRON_NO_ASAR: '1',
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`
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
