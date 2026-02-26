import { createActionRunner, runWithLiveLogs } from '@pipelab/plugin-core'
import { createPreviewProps, tauri } from './tauri'
import { merge } from 'ts-deepmerge'
import { defaultTauriConfig } from './utils'

export const previewRunner = createActionRunner<ReturnType<typeof createPreviewProps>>(
  async (options) => {
    const url = options.inputs['input-url']
    if (url === '') {
      throw new Error("URL can't be empty")
    }

    if (!options.inputs.configuration) {
      throw new Error('Missing tauri configuration')
    }

    const completeConfiguration = merge(defaultTauriConfig, {
      alwaysOnTop: options.inputs.configuration['alwaysOnTop'],
      appBundleId: options.inputs.configuration['appBundleId'],
      appCategoryType: options.inputs.configuration['appCategoryType'],
      appCopyright: options.inputs.configuration['appCopyright'],
      appVersion: options.inputs.configuration['appVersion'],
      author: options.inputs.configuration['author'],
      description: options.inputs.configuration['description'],
      tauriVersion: options.inputs.configuration['tauriVersion'],
      enableExtraLogging: options.inputs.configuration['enableExtraLogging'],
      clearServiceWorkerOnBoot: options.inputs.configuration['clearServiceWorkerOnBoot'],
      frame: options.inputs.configuration['frame'],
      fullscreen: options.inputs.configuration['fullscreen'],
      icon: options.inputs.configuration['icon'],
      height: options.inputs.configuration['height'],
      name: options.inputs.configuration['name'],
      toolbar: options.inputs.configuration['toolbar'],
      transparent: options.inputs.configuration['transparent'],
      width: options.inputs.configuration['width'],
      enableSteamSupport: options.inputs.configuration['enableSteamSupport'],
      steamGameId: options.inputs.configuration['steamGameId'],
      ignore: options.inputs.configuration['ignore'],
      openDevtoolsOnStart: options.inputs.configuration['openDevtoolsOnStart'],
      enableDiscordSupport: options.inputs.configuration['enableDiscordSupport'],
      discordAppId: options.inputs.configuration['discordAppId'],
      customPackages: options.inputs.configuration['customPackages'],
      backgroundColor: options.inputs.configuration['backgroundColor']
    } satisfies DesktopApp.Tauri) as DesktopApp.Tauri

    console.log('completeConfiguration', completeConfiguration)

    await tauri('preview', url, options, completeConfiguration)
    return
  }
)
