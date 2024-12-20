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
  isElectron: () => true,
  exit: (code) => {
    ipcRenderer.send('exit', code)
  }
})

contextBridge.exposeInMainWorld('isElectron', true)

console.log('Preload script loaded')
