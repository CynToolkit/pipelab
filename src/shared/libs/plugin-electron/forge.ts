import { outFolderName } from 'src/constants'
import { ActionRunnerData, createAction, InputsDefinition, runWithLiveLogs } from '../plugin-core'
import type { MakeOptions } from '@electron-forge/core'
import { ElectronConfiguration } from './model'
import { writeFile } from 'node:fs/promises'
import ejs from 'ejs'
import { merge } from 'ts-deepmerge'

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = 'electron:make'
export const IDPackage = 'electron:package'

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
    value: {} as Partial<ElectronConfiguration>,
    control: {
      type: 'json'
    }
  },
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

// type Inputs = ParamsToInput<typeof params>

export const createProps = (
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
    params,
    outputs: {
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
    }
  })

export const forge = async (
  action: 'make' | 'package',
  { cwd, log, inputs, setOutput, paths }: ActionRunnerData<ReturnType<typeof createProps>>
) => {
  log('Building electron')

  const { assets, unpack } = paths

  const { join, basename, delimiter } = await import('node:path')
  const { cp } = await import('node:fs/promises')
  const { arch, platform } = await import('process')
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
  const appFolder = inputs['input-folder']

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

  // copy app to template
  await cp(appFolder, placeAppFolder, {
    recursive: true
  })

  const completeConfiguration = merge(
    {
      alwaysOnTop: false,
      appBundleId: 'com.cyn.app',
      appCategoryType: '',
      appCopyright: 'Copyright © 2024 Cyn',
      appVersion: '1.0.0',
      author: 'Cyn',
      customMainCode: '',
      description: 'A simple Electron application',
      electronVersion: '',
      enableDisableRendererBackgrounding: false,
      enableInProcessGPU: false,
      frame: true,
      fullscreen: false,
      icon: '',
      height: 600,
      name: 'Cyn',
      toolbar: true,
      transparent: false,
      width: 800
    } satisfies ElectronConfiguration,
    inputs.configuration
  )

  log('completeConfiguration', completeConfiguration)

  // render forge config
  ejs.renderFile(
    join(templateFolder, 'forge.config.cjs'),
    {
      config: completeConfiguration
    },
    {},
    (err: Error, str: string) => {
      writeFile(join(destinationFolder, 'forge.config.cjs'), str, 'utf8')
    }
  )

  // index / main
  ejs.renderFile(
    join(templateFolder, 'src', 'index.js'),
    {
      config: completeConfiguration
    },
    {},
    (err: Error, str: string) => {
      writeFile(join(destinationFolder, 'src', 'index.js'), str, 'utf8')
    }
  )

  // preload
  ejs.renderFile(
    join(templateFolder, 'src', 'preload.js'),
    {
      config: completeConfiguration
    },
    {},
    (err: Error, str: string) => {
      writeFile(join(destinationFolder, 'src', 'preload.js'), str, 'utf8')
    }
  )

  // copy custom main code
  const destinationFile = join(destinationFolder, 'src', 'custom-main.js')
  if (completeConfiguration.customMainCode) {
    await cp(completeConfiguration.customMainCode, destinationFile)
  } else {
    await writeFile(destinationFile, 'console.log("No custom main code provided")')
  }

  const shimsPaths = join(assets, 'shims')

  log('Installing packages')
  await runWithLiveLogs(
    process.execPath,
    [pnpm, 'install', '--prefer-offline'],
    {
      cwd: destinationFolder,
      env: {
        // DEBUG: '*',
        ELECTRON_RUN_AS_NODE: '1',
        PATH: `${shimsPaths}${delimiter}${process.env.PATH}`
      }
    },
    log
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
          PATH: `${shimsPaths}${delimiter}${process.env.PATH}`
        }
      },
      log
    )
  }

  try {
    const finalPlatform = inputs.platform ?? platform ?? ''
    const finalArch = inputs.arch ?? arch ?? ''

    const logs = await runWithLiveLogs(
      process.execPath,
      [forge, action, '--', '--arch', finalArch, '--platform', finalPlatform],
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

      setOutput('output', join(destinationFolder, 'out', outName))
    } else {
      setOutput('output', join(destinationFolder, 'out', 'make'))
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
  }
}
