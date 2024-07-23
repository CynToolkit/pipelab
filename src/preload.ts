import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { version } from '../package.json'

// Custom APIs for renderer
const api = {
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('version', version)
    contextBridge.exposeInMainWorld("isPackaged", process.env.NODE_ENV !== "development")
    contextBridge.exposeInMainWorld("isTest", process.env.TEST === 'true')
    console.log('process.env.NODE_ENV', process.env.NODE_ENV)
    // contextBridge.exposeInMainWorld('_dirname', __dirname)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.version = version
  // @ts-ignore (define in dts)
  window.isPackaged = app.isPackaged
  // @ts-ignore (define in dts)
  window.isTest = process.env.TEST === 'true'
  // window.__dirname = __dirname
}
