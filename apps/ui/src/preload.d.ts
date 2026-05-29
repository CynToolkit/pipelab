import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
    version?: string;
    isPackaged?: boolean;
    pipelab?: {
      versions?: {
        electron?: string;
        chrome?: string;
        node?: string;
        app?: string;
      };
      showOpenDialog?: (options: any) => Promise<any>;
      showSaveDialog?: (options: any) => Promise<any>;
      openExternal?: (url: string) => Promise<any>;
      showItemInFolder?: (path: string) => Promise<any>;
    };
  }
}
