declare namespace DesktopApp {
  interface Config {
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
    enableExtraLogging: boolean
    clearServiceWorkerOnBoot: boolean

    enableSteamSupport: boolean
    steamGameId: number

    enableDiscordSupport: boolean
    discordAppId: string

    ignore: (string | RegExp)[]
    openDevtoolsOnStart: boolean

    /**
     * User-defined npm packages to install (format: "package[@version]")
     */
    customPackages?: string[]
    backgroundColor: string
    enableDoctor: boolean
  }

  interface Electron extends Config {
    enableInProcessGPU: boolean
    enableDisableRendererBackgrounding: boolean
    customMainCode: string
    electronVersion: string
    disableAsarPackaging: boolean
    forceHighPerformanceGpu: boolean
    clearServiceWorkerOnBoot: boolean
  }

  interface Tauri extends Config {
    tauriVersion: string
  }
}
