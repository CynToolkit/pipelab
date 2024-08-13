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
  }
})

console.log('Preload script loaded')
