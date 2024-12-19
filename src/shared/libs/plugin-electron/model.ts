export type ElectronConfiguration = {
  name: string
  appBundleId: string
  appCopyright: string
  appVersion: string
  electronVersion: string
  customMainCode: string
  author: string
  description: string
  width: number
  height: number
  fullscreen: boolean
  frame: boolean
  transparent: boolean
  toolbar: boolean
  alwaysOnTop: boolean
  enableInProcessGPU: boolean
  enableDisableRendererBackgrounding: boolean
  icon: string
  appCategoryType: string
  enableSteamSupport: boolean
  steamGameId: number
}
