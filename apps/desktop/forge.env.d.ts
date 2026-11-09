export {}; // Make this a module

declare global {
  type ElectronAPI = import("@electron-toolkit/preload").ElectronAPI;

  interface Window {
    version: string;
    electron: ElectronAPI;
    api: any;
    isPackaged: boolean;
    isTest: boolean;
    isCI: boolean;
  }

  type VitePluginConfig = ConstructorParameters<
    typeof import("@electron-forge/plugin-vite").VitePlugin
  >[0];
}

declare module "vite" {
  interface ConfigEnv<K extends keyof VitePluginConfig = keyof VitePluginConfig> {
    root: string;
    forgeConfig: VitePluginConfig;
    forgeConfigSelf: VitePluginConfig[K][number];
  }
}
