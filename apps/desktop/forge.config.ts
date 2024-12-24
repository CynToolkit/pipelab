import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { name } from './src/constants'
import { cp } from 'node:fs/promises'
import path from 'node:path'

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // unpack: '**/node_modules/{pnpm,@electron-forge,playwright}/**/*'
    },
    prune: false,
    // asar: false,
    extraResource: [
      '.vite/build/assets',
      'node_modules/@pipelab/core'
    ],
    name,
    derefSymlinks: true,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name
    }),
    new MakerZIP(undefined, ['darwin', 'linux', 'win32']),
    // new MakerDMG()
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'CynToolkit',
          name: 'pipelab'
        },
        prerelease: true,
        draft: true,
        generateReleaseNotes: true
      }
    }
  ],
  hooks: {
    preMake: async () => {
      console.log('preMake')
    },
    prePackage: async () => {
      console.log('prePackage')
    },
    postPackage: async () => {
      console.log('postPackage')
    },
    generateAssets: async () => {
      console.log('generateAssets')
    },
    packageAfterExtract: async (forge, buildPath, electronVersion, platform, arch) => {
      console.log('packageAfterExtract', forge, buildPath, electronVersion, platform, arch)
    },
    packageAfterPrune: async (forge, buildPath, electronVersion, platform, arch) => {
      console.log('packageAfterPrune', forge, buildPath, electronVersion, platform, arch)
    },
    packageAfterCopy: async (forge, buildPath, electronVersion, platform, arch) => {
      console.log('packageAfterCopy', forge, buildPath, electronVersion, platform, arch)

      // const source = path.join(__dirname, 'node_modules/@pipelab/core')
      // console.log('source', source)
      // const dest = path.join(buildPath, 'node_modules/@pipelab/core')
      // console.log('dest', dest)

      // try {
      //   await cp(
      //     source,
      //     dest,
      //     {
      //       dereference: true,
      //       recursive: true,
      //     }
      //   )
      // } catch (e) {
      //   console.error(e)
      // }
    }
  },
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts'
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts'
        }
      ]
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: true, // needed
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: true,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false, // must enable again, broken for windows build on linux
      [FuseV1Options.OnlyLoadAppFromAsar]: false // need tesing
    })
  ]
}

export default config
