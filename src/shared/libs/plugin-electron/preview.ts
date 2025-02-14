import { createActionRunner, runWithLiveLogs } from '@pipelab/plugin-core'
import { createPreviewProps, forge } from './forge'
import { merge } from 'ts-deepmerge'

export const previewRunner = createActionRunner<ReturnType<typeof createPreviewProps>>(
  async (options) => {
    const url = options.inputs['input-url']
    if (url === '') {
      throw new Error("URL can't be empty")
    }

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
        ignore: []
      } satisfies ElectronAppConfig.Config,
      options.inputs.configuration
    ) as ElectronAppConfig.Config

    const output = await forge('package', undefined, options, completeConfiguration)
    options.log('Opening preview', output)
    options.log('Opening url', url)
    await runWithLiveLogs(
      output.binary,
      ['--url', url],
      {
        cancelSignal: options.abortSignal
      },
      options.log
    )
    return
  }
)
