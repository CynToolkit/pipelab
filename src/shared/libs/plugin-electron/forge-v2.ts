import { getBinName, outFolderName } from 'src/constants'
import {
  ActionRunnerData,
  createAction,
  createPathParam,
  createStringParam,
  fileExists,
  InputsDefinition,
  OutputsDefinition,
  runWithLiveLogs
} from '../plugin-core'
import type { MakeOptions } from '@electron-forge/core'
import { merge } from 'ts-deepmerge'
import { app } from 'electron'

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = 'electron:make'
export const IDPackage = 'electron:package'
export const IDPreview = 'electron:preview'

const paramsInputFolder = {
  'input-folder': createPathParam('', {
    label: 'Folder to package',
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
    control: {
      type: 'json'
    }
  }
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

export const forgeV2 = async (
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
  >
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

  if (!inputs.configuration) {
    throw new Error('Missing electron configuration')
  }

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

  const completeConfiguration = merge(
    {
      alwaysOnTop: false,
      appBundleId: 'com.pipelab.app',
      appCategoryType: '',
      appCopyright: 'Copyright © 2024 Pipelab',
      appVersion: '1.0.0',
      author: 'Pipelab',
      customMainCode: '',
      description: 'A simple Electron application',
      electronVersion: '',
      disableAsarPackaging: true,
      forceHighPerformanceGpu: false,
      enableExtraLogging: false,
      clearServiceWorkerOnBoot: false,
      enableDisableRendererBackgrounding: false,
      enableInProcessGPU: false,
      frame: true,
      fullscreen: false,
      icon: '',
      height: 600,
      name: 'Pipelab',
      toolbar: true,
      transparent: false,
      width: 800,
      enableSteamSupport: false,
      steamGameId: 480,
      ignore: []
    } satisfies ElectronAppConfig.Config,
    inputs.configuration
  ) as ElectronAppConfig.Config

  console.log('completeConfiguration', completeConfiguration)

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
