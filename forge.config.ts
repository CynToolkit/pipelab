import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerPKG } from '@electron-forge/maker-pkg'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { name } from './src/constants'
import * as fs from 'fs-extra'
import * as path from 'path'
/** @type {*} */
const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'app.pipelab.desktop',
    // asar: {
    //   // unpack: '*.{node,dll,so,lib,dylib,exe}'
    // },
    asar: false,
    extraResource: ['assets'],
    // extraResource: ['.vite/build/assets'],
    name,
    icon: 'assets/build/icon',
    extendInfo: {
      NSAppleEventsUsageDescription:
        'This app need to run commands through Terminal for specific tasks such as steamcmd.sh.'
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    },
    osxSign: {
      strictVerify: false,
      identity: `Developer ID Application: Quentin Goinaud (${process.env.APPLE_TEAM_ID})`,
      optionsForFile: (filePath) => {
        return {
          'entitlements-inherit': './assets/build/entitlements.mac.plist',
          entitlements: './assets/build/entitlements.mac.plist'
        }
      }
    }
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name,
      setupIcon: 'assets/build/icon.ico'
    }),
    new MakerZIP(undefined, ['darwin', 'linux', 'win32']),
    new MakerDMG(),
    // new MakerPKG({
    //   identity: `Developer ID Application: Quentin Goinaud (${process.env.APPLE_TEAM_ID})`,
    // }),
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
        draft: false,
        generateReleaseNotes: true
      }
    }
  ],
  hooks: {
    packageAfterCopy: async (forgeConfig, buildPath, electronVersion, platform, arch) => {
      console.log('INFO: Running packageAfterCopy hook...');
      const projectRoot = path.resolve(__dirname);
      const packagesToCopy = [
        '@esbuild',
        '@lydell'
      ];

      for (const packageName of packagesToCopy) {
        const srcDir = path.join(projectRoot, 'node_modules', packageName);
        const destDir = path.join(buildPath, 'node_modules', packageName);

        try {
          if (await fs.pathExists(srcDir)) {
            console.log(`INFO: Copying ${srcDir} to ${destDir}`);
            await fs.copy(srcDir, destDir, { overwrite: true });
            console.log(`INFO: Successfully copied ${packageName}.`);
          } else {
            console.warn(`WARN: Source directory ${srcDir} does not exist. Skipping copy for ${packageName}.`);
          }
        } catch (err) {
          console.error(`ERROR: Failed to copy ${packageName}:`, err);
          // Optionally, re-throw the error if this should halt the build
          // throw err;
        }
      }
      console.log('INFO: packageAfterCopy hook finished.');
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
          config: 'vite.preload.config.mts'
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
