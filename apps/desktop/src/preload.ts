import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: any;
    pipelab: any;
    version: string;
    isPackaged: boolean;
  }
}

// No "workspace" pseudo-version: main always passes --app-version (dev included),
// so parse it unconditionally and fall back to 1.0.0 only if truly absent.
let version = "1.0.0";
try {
  const versionArg = process.argv.find((arg) => arg.startsWith("--app-version="));
  version = versionArg ? versionArg.split("=")[1] : "1.0.0";
} catch (error) {
  console.error("Failed to parse version in preload:", error);
}

// Custom APIs for renderer
// TODO: unify window and contextBridge

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);

    const versions = {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      app: version,
    };
    console.log("[Preload] Exposing versions:", versions);

    contextBridge.exposeInMainWorld("pipelab", {
      versions,
      showOpenDialog: (options: any) => ipcRenderer.invoke("dialog:showOpenDialog", options),
      showSaveDialog: (options: any) => ipcRenderer.invoke("dialog:showSaveDialog", options),
      openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
      showItemInFolder: (path: string) => ipcRenderer.invoke("shell:showItemInFolder", path),
      isPathBlacklisted: (path: string) => ipcRenderer.invoke("path:isBlacklisted", path),
      relaunch: () => ipcRenderer.invoke("app:relaunch"),
    });
    contextBridge.exposeInMainWorld("version", version);
    contextBridge.exposeInMainWorld("isPackaged", process.env.NODE_ENV !== "development");
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  const versions = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    app: version,
  };
  window.pipelab = {
    versions,
    showOpenDialog: (options: any) => ipcRenderer.invoke("dialog:showOpenDialog", options),
    showSaveDialog: (options: any) => ipcRenderer.invoke("dialog:showSaveDialog", options),
    openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
    showItemInFolder: (path: string) => ipcRenderer.invoke("shell:showItemInFolder", path),
    isPathBlacklisted: (path: string) => ipcRenderer.invoke("path:isBlacklisted", path),
    relaunch: () => ipcRenderer.invoke("app:relaunch"),
  };
  window.version = version;
  window.isPackaged = process.env.NODE_ENV !== "development";
}
