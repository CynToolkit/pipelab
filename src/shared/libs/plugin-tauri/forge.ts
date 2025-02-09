// https://github.com/tauri-apps/tauri/issues/9220
// https://github.com/tauri-apps/wry/blob/dev/examples/gtk_multiwebview.rs
// https://github.com/FabianLars/tauri-v2-wgpu

import { getBinName, outFolderName } from 'src/constants'
import {
  ActionRunnerData,
  createAction,
  InputsDefinition,
  OutputsDefinition,
  runWithLiveLogs
} from '../plugin-core'
import { TauriConfiguration } from './model'
import { writeFile } from 'node:fs/promises'
import { merge } from 'ts-deepmerge'

export const IDMake = 'tauri:make'
export const IDPackage = 'tauri:package'
export const IDPreview = 'tauri:preview'

const paramsInputFolder = {
  'input-folder': {
    value: '',
    label: 'Folder to package',
    control: {
      type: 'path',
      options: {
        properties: ['openDirectory']
      }
    }
  }
} satisfies InputsDefinition

const paramsInputURL = {
  'input-url': {
    value: '',
    label: 'URL to preview',
    control: {
      type: 'input',
      options: {
        kind: 'text'
      }
    }
  }
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
    label: 'Tauri configuration',
    value: undefined as Partial<TauriConfiguration> | undefined,
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

export const forge = async (
  action: 'make' | 'package',
  appFolder: string | undefined,
  {
    cwd,
    log,
    inputs,
    setOutput,
    paths,
    abortSignal,
  }: ActionRunnerData<
    | ReturnType<typeof createMakeProps>
    | ReturnType<typeof createPackageProps>
    | ReturnType<typeof createPreviewProps>
  >
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  log('Building Tauri')

  const { assets, unpack } = paths

  const { join, basename, delimiter, relative } = await import('node:path')
  const { cp } = await import('node:fs/promises')
  const { arch, platform } = await import('process')
  // const { fileURLToPath } = await import('url')
  // const __dirname = fileURLToPath(dirname(import.meta.url))
  const { app } = await import('electron')

  const modulesPath = join(unpack, 'node_modules')

  const pnpm = join(modulesPath, 'pnpm', 'bin', 'pnpm.cjs')

  const destinationFolder = join(cwd, 'build')

  const templateFolder = join(assets, 'tauri', 'template', 'app')

  // copy template to destination
  await cp(templateFolder, destinationFolder, {
    recursive: true,
    filter: (src) => {
      // log('dest', dest)
      return (
        basename(src) !== 'node_modules' &&
        !relative(templateFolder, src).startsWith('src-tauri/target')
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

  const completeConfiguration = merge(
    {
      name: 'Pipelab'
    } satisfies TauriConfiguration,
    inputs.configuration
  ) as TauriConfiguration

  log('completeConfiguration', completeConfiguration)

  writeFile(
    join(destinationFolder, 'config.cjs'),
    `module.exports = ${JSON.stringify(completeConfiguration, undefined, 2)}`,
    'utf8'
  )

  // copy custom main code
  // const destinationFile = join(destinationFolder, 'src', 'custom-main.js')
  // if (completeConfiguration.customMainCode) {
  //   await cp(completeConfiguration.customMainCode, destinationFile)
  // } else {
  //   await writeFile(destinationFile, 'console.log("No custom main code provided")')
  // }

  const shimsPaths = join(assets, 'shims')

  const userData = app.getPath('userData')

  const pnpmHome = join(userData, 'config', 'pnpm')

  log('Installing packages')
  await runWithLiveLogs(
    process.execPath,
    [pnpm, 'install', '--prefer-offline', /* bug */ '--force'],
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
      onExit(code) {
        console.log('exit', code)
      },
    }
  )

  log('Done installing dependencies')

  // override tauri version
  // if (completeConfiguration.tauriVersion && completeConfiguration.tauriVersion !== '') {
  //   log(`Installing tauri@${completeConfiguration.tauriVersion}`)
  //   await runWithLiveLogs(
  //     process.execPath,
  //     [pnpm, 'install', `tauri@${completeConfiguration.tauriVersion}`, '--prefer-offline'],
  //     {
  //       cwd: destinationFolder,
  //       env: {
  //         // DEBUG: '*',
  //         ELECTRON_RUN_AS_NODE: '1',
  //         PATH: `${shimsPaths}${delimiter}${process.env.PATH}`,
  //         PNPM_HOME: pnpmHome
  //       }
  //     },
  //     log
  //   )
  // }

  try {
    const finalPlatform = inputs.platform ?? platform ?? ''
    const finalArch = inputs.arch ?? arch ?? ''

    log(process.execPath, [
      pnpm,
      'tauri',
      'build',
      '--no-bundle' /* '--arch', finalArch, '--platform', finalPlatform */
    ])

    const logs = await runWithLiveLogs(
      process.execPath,
      [pnpm, 'tauri', 'build', '--no-bundle' /* '--arch', finalArch, '--platform', finalPlatform */],
      {
        cwd: destinationFolder,
        env: {
          // DEBUG: '*',
          ELECTRON_NO_ASAR: '1',
          ELECTRON_RUN_AS_NODE: '1',
          PATH: `${shimsPaths}${delimiter}${process.env.PATH}`
        }
      },
      log
    )

    log('logs', logs)

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
