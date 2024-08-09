import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import serve from 'serve-handler'
import { createServer } from 'http'

// if (require('electron-squirrel-startup')) {
//   app.quit()
// }

/**
 *
 * @returns {Promise<number>}
 */
const createAppServer = () => {
  return new Promise(async (resolve) => {
    const dir = app.isPackaged ? join(import.meta.dirname, './app') : './src/app'

    const server = createServer((req, res) => {
      return serve(req, res, {
        maxAge: 0,
        public: dir
      })
    })
    server.listen(0, () => {
      const port = server.address().port
      return resolve(port)
    })
  })
}

const createWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.js')
    }
  })

  const port = await createAppServer()

  console.log('port', port)

  await mainWindow.loadURL(`http://localhost:${port}`)
}

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
