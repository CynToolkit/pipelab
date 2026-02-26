import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { version } from '../package.json'

// Custom APIs for renderer
const api = {}

// TODO: unify window and contextBridge

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  // @ts-expect-error import.meta
  const isCI = process.env.CI === 'true' || import.meta.env.CI === 'true'

  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('version', version)
    contextBridge.exposeInMainWorld('isPackaged', process.env.NODE_ENV !== 'development')
    contextBridge.exposeInMainWorld('isTest', process.env.TEST === 'true')
    contextBridge.exposeInMainWorld('isCI', isCI)
    // eslint-disable-next-line no-console
    console.log('process.env.NODE_ENV', process.env.NODE_ENV)
    // contextBridge.exposeInMainWorld('_dirname', __dirname)
  } catch (error) {}
} else {
  window.electron = electronAPI
  window.api = api
  window.version = version
  window.isPackaged = process.env.NODE_ENV !== 'development'
  window.isTest = process.env.TEST === 'true'
  // window.__dirname = __dirname
}
