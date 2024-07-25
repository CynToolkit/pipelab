import { createAction, createActionRunner, runWithLiveLogs } from '@cyn/plugin-core'
import type { MakeOptions } from '@electron-forge/core'

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const ID = 'electron:make'

export const make = createAction({
  id: ID,
  name: 'Create Installer',
  description: 'Create a distributable installer for your chosen platform',
  icon: '',
  displayString: 'Build package',
  meta: {},
  params: {
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
    'input-folder': {
      value: '',
      label: 'Input folder',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    }
  },
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

export const makeRunner = createActionRunner<typeof make>(
  async ({ log, inputs, cwd, setOutput, paths }) => {
    log('Building electron')

    const { assets, unpack } = paths

    const { join, dirname, basename } = await import('node:path')
    const { cp } = await import('node:fs/promises')
    const { fileURLToPath } = await import('url')
    // @ts-expect-error
    const __dirname = fileURLToPath(dirname(import.meta.url))
    const { app } = await import('electron')

    console.log('__dirname', __dirname)
    console.log('process.resourcesPath', process.resourcesPath)

    console.log('process.env.NODE_ENV', process.env.NODE_ENV)

    console.log('process.cwd()', process.cwd())
    console.log('app.getAppPath', app.getAppPath())

    const modulesPath = join(unpack, 'node_modules')

    console.log('resourcePath', modulesPath)

    const _pnpm = join(modulesPath, 'pnpm', 'bin', 'pnpm.cjs')
    console.log('_pnpm', _pnpm)
    const pnpm = _pnpm/* .replace('app.asar', 'app.asar.unpacked') */
    // const forge = join(
    //   __dirname,
    //   "node_modules",
    //   "@electron-forge",
    //   "cli",
    //   "dist",
    //   "electron-forge.js"
    // ).replace('app.asar/out/main', 'app.asar.unpacked');

    const forge = join(modulesPath, '@electron-forge', 'cli', 'dist', 'electron-forge.js')/* .replace(
      'app.asar',
      'app.asar.unpacked'
    ) */

    console.log('pnpm', pnpm)

    const appFolder = inputs['input-folder']
    log('appFolder', appFolder)

    const destinationFolder = join(cwd, 'build')

    log('destinationFolder', destinationFolder)

    const _templateFolder = join(assets, 'electron', 'template', 'app')

    const templateFolder = _templateFolder/* .replace('app.asar', 'app.asar.unpacked') */

    log('_templateFolder', _templateFolder)
    log('templateFolder', templateFolder)

    await cp(templateFolder, destinationFolder, {
      recursive: true,
      filter: (src, dest) => {
        // console.log('src', src)
        // console.log('dest', dest)
        return basename(src) !== 'node_modules'
      }
    })

    const placeAppFolder = join(destinationFolder, 'src', 'app')

    log('placeAppFolder', placeAppFolder)

    const outFolder = join(cwd, 'output')

    log('outFolder', outFolder)

    await cp(appFolder, placeAppFolder, {
      recursive: true
    })

    log('Installing nodejs')
    await runWithLiveLogs(
      process.execPath,
      [
        pnpm,
        'env',
        'use',
        '--global 22'
      ],
      {
        cwd: destinationFolder,
        env: {
          ELECTRON_RUN_AS_NODE: '1',
        }
      },
      log
    )

    log('Installing packages')
    await runWithLiveLogs(
      process.execPath,
      [
        pnpm,
        'install', '--prefer-offline'],
      {
        cwd: destinationFolder,
        env: {
          ELECTRON_RUN_AS_NODE: '1',
        }
      },
      log
    )

    try {
      // console.log({
      //   arch: inputs.arch,
      //   dir: destinationFolder,
      //   interactive: false,
      //   outDir: cwd,
      //   platform: inputs.platform,
      //   skipPackage: false,
      // });
      // const result = await api.make({
      //   arch: inputs.arch,
      //   dir: destinationFolder,
      //   interactive: false,
      //   outDir: cwd,
      //   platform: inputs.platform,
      //   skipPackage: false,
      // });

      const logs = await runWithLiveLogs(
        process.execPath,
        [
          forge,
          'make', '--', '--arch', inputs.arch ?? '', '--platform', inputs.platform ?? ''],
        {
          cwd: destinationFolder,
          env: {
            DEBUG: 'electron-packager',
            ELECTRON_RUN_AS_NODE: '1',
          }
        },
        log
      )

      console.log('logs', logs)

      setOutput('output', join(destinationFolder, 'out', 'make'))
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === 'RequestError') {
          console.log('Request error')
        }
        if (e.name === 'RequestError') {
          console.log('Request error')
        }
      }
      console.error(e)
    }
  }
)
