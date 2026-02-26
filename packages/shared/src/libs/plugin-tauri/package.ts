import { createActionRunner } from '@pipelab/plugin-core'
import { createPackageV2Props, tauri } from './tauri'
import { merge } from 'ts-deepmerge'
import { defaultTauriConfig } from './utils'

export const packageV2Runner = createActionRunner<ReturnType<typeof createPackageV2Props>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

    const completeConfiguration = merge(defaultTauriConfig, {
      alwaysOnTop: options.inputs['alwaysOnTop'],
      appBundleId: options.inputs['appBundleId'],
      appCategoryType: options.inputs['appCategoryType'],
      appCopyright: options.inputs['appCopyright'],
      appVersion: options.inputs['appVersion'],
      author: options.inputs['author'],
      description: options.inputs['description'],
      tauriVersion: options.inputs['tauriVersion'],
      enableExtraLogging: options.inputs['enableExtraLogging'],
      clearServiceWorkerOnBoot: options.inputs['clearServiceWorkerOnBoot'],
      frame: options.inputs['frame'],
      fullscreen: options.inputs['fullscreen'],
      icon: options.inputs['icon'],
      height: options.inputs['height'],
      name: options.inputs['name'],
      toolbar: options.inputs['toolbar'],
      transparent: options.inputs['transparent'],
      width: options.inputs['width'],
      enableSteamSupport: options.inputs['enableSteamSupport'],
      steamGameId: options.inputs['steamGameId'],
      ignore: options.inputs['ignore'],
      openDevtoolsOnStart: options.inputs['openDevtoolsOnStart'],
      enableDiscordSupport: options.inputs['enableDiscordSupport'],
      discordAppId: options.inputs['discordAppId'],
      customPackages: options.inputs['customPackages'],
      backgroundColor: options.inputs['backgroundColor']
    } satisfies DesktopApp.Tauri) as DesktopApp.Tauri

    console.log('completeConfiguration', completeConfiguration)

    await tauri('package', appFolder, options, completeConfiguration)
  }
)
