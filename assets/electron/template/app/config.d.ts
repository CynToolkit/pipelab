declare namespace AppConfig {
  interface Config {
    enableInProcessGPU: boolean
    enableDisableRendererBackgrounding: boolean
    width: number
    height: number
    fullscreen: boolean
    frame: boolean
    transparent: boolean
    toolbar: boolean
    alwaysOnTop: boolean
    name: string
    appBundleId: string
    appCopyright: string
    appVersion: string
    author: string
    description: string
    appCategoryType: string
    icon: string
    disableAsarPackaging: boolean
    forceHighPerformanceGpu: boolean
    enableExtraLogging: boolean
    enableSteamSupport: boolean
    steamGameId: number
  }
}
