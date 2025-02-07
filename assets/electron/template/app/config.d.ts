declare namespace ElectronAppConfig {
  interface Config {
    enableInProcessGPU: boolean
    enableDisableRendererBackgrounding: boolean
    width: number
    height: number
    fullscreen: boolean
    frame: boolean
    customMainCode: string
    transparent: boolean
    toolbar: boolean
    alwaysOnTop: boolean
    name: string
    appBundleId: string
    appCopyright: string
    appVersion: string
    author: string
    description: string
    electronVersion: string
    appCategoryType: string
    icon: string
    disableAsarPackaging: boolean
    forceHighPerformanceGpu: boolean
    enableExtraLogging: boolean
    clearServiceWorkerOnBoot: boolean
    enableSteamSupport: boolean
    ignore: (string | RegExp)[]
    steamGameId: number
  }
}
