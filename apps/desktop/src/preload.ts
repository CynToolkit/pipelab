import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { version } from "../package.json";

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
  window.pipelab = { versions };
  window.version = version;
  window.isPackaged = process.env.NODE_ENV !== "development";
}
