import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import serve from 'serve-handler'
import { createServer } from 'http'
import './custom-main.js'

/**
 *
 * @returns {Promise<number>}
 */
const createAppServer = () => {
  // eslint-disable-next-line no-async-promise-executor
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

const registerHandlers = async () => {
  // handlers
}

app.whenReady().then(async () => {
  await registerHandlers()

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
