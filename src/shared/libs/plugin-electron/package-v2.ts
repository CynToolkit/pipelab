import { createActionRunner } from '@pipelab/plugin-core'
import { forge } from './forge'
import { createPackageV2Props } from './forge'
import { merge } from 'ts-deepmerge'

export const packageV2Runner = createActionRunner<ReturnType<typeof createPackageV2Props>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

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
        enableDiscordSupport: false,
        discordAppId: '',
        ignore: [],
        openDevtoolsOnStart: false,
      } satisfies ElectronAppConfig.Config,
      {
        alwaysOnTop: options.inputs['alwaysOnTop'],
        appBundleId: options.inputs['appBundleId'],
        appCategoryType: options.inputs['appCategoryType'],
        appCopyright: options.inputs['appCopyright'],
        appVersion: options.inputs['appVersion'],
        author: options.inputs['author'],
        customMainCode: options.inputs['customMainCode'],
        description: options.inputs['description'],
        electronVersion: options.inputs['electronVersion'],
        disableAsarPackaging: options.inputs['disableAsarPackaging'],
        forceHighPerformanceGpu: options.inputs['forceHighPerformanceGpu'],
        enableExtraLogging: options.inputs['enableExtraLogging'],
        clearServiceWorkerOnBoot: options.inputs['clearServiceWorkerOnBoot'],
        enableDisableRendererBackgrounding: options.inputs['enableDisableRendererBackgrounding'],
        enableInProcessGPU: options.inputs['enableInProcessGPU'],
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
        openDevtoolsOnStart: options.inputs["openDevtoolsOnStart"],
        enableDiscordSupport: options.inputs['enableDiscordSupport'],
        discordAppId: options.inputs['discordAppId'],
      } satisfies ElectronAppConfig.Config
    ) as ElectronAppConfig.Config

    console.log('completeConfiguration', completeConfiguration)

    // @ts-expect-error options is not really compatible
    await forge('package', appFolder, options, completeConfiguration)
  }
)
