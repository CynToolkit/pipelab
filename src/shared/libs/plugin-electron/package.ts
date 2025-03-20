import { createActionRunner } from '@pipelab/plugin-core'
import { createPackageProps, forge } from './forge'
import { merge } from 'ts-deepmerge'

export const packageRunner = createActionRunner<ReturnType<typeof createPackageProps>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

    if (!options.inputs.configuration) {
      throw new Error('Missing electron configuration')
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
        enableDiscordSupport: false,
        discordAppId: '',
        ignore: [],
        openDevtoolsOnStart: false,
      } satisfies ElectronAppConfig.Config,
      options.inputs.configuration
    ) as ElectronAppConfig.Config

    // @ts-expect-error options is not really compatible
    await forge('package', appFolder, options, completeConfiguration)
  }
)
