const { contextBridge, ipcRenderer } = require('electron')

// Expose a limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: async (channel, data) => {
    try {
      return await ipcRenderer.invoke(channel, data)
    } catch (error) {
      console.error('IPC invocation error:', error)
      throw error
    }
  },
  handle: (message, handler) => {
    ipcRenderer.on(message, (event, ...args) => handler(...args))
  },
  isElectron: () => true,
  exit: (code) => {
    ipcRenderer.send('exit', code)
  }
})

/** @deprecated */
contextBridge.exposeInMainWorld('isElectron', true)
contextBridge.exposeInMainWorld('isPipelab', true)
contextBridge.exposeInMainWorld('pipelabEngine', 'electron')

console.log('Preload script loaded')
