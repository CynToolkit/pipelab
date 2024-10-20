// @ts-check

import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
// @ts-expect-error no types
import serve from 'serve-handler'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import './custom-main.js'
import mri from 'mri'
import config from '../config.cjs'

// user
import userFolder from './handlers/user/folder.js'

// fs
import fsWrite from './handlers/fs/write.js'
import fsRead from './handlers/fs/read.js'
import fsReadBinary from './handlers/fs/read-binary.js'
import fsFolderCreate from './handlers/fs/folder-create.js'
import fsList from './handlers/fs/list.js'
import fsFileSize from './handlers/fs/file-size.js'

// window
import windowMaximize from './handlers/window/maximize.js'
import windowMinimize from './handlers/window/minimize.js'
import windowRequestAttention from './handlers/window/request-attention.js'
import windowRestore from './handlers/window/restore.js'
import windowSetAlwaysOnTop from './handlers/window/set-always-on-top.js'
import windowSetHeight from './handlers/window/set-height.js'
import windowSetWidth from './handlers/window/set-width.js'
import windowSetMinimumSize from './handlers/window/set-minimum-size.js'
import windowSetMaximumSize from './handlers/window/set-maximum-size.js'
import windowSetResizable from './handlers/window/set-resizable.js'
import windowSetTitle from './handlers/window/set-title.js'
import windowSetX from './handlers/window/set-x.js'
import windowSetY from './handlers/window/set-y.js'
import windowShowDevTools from './handlers/window/show-dev-tools.js'
import windowUnmaximize from './handlers/window/unmaximize.js'

// dialog
import dialogFolder from './handlers/dialog/folder.js'
import dialogOpen from './handlers/dialog/open.js'
import dialogSave from './handlers/dialog/save.js'

// general
import engine from './handlers/general/engine.js'
import run from './handlers/general/run.js'
import open from './handlers/general/open.js'
import showInExplorer from './handlers/general/open-in-explorer.js'

/**
 * Assert switch is exhaustive
 * @param {never} _x
 * @returns {never}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assertUnreachable(_x) {
  throw new Error("Didn't expect to get here")
}

console.log('process.argv', process.argv)
const argv = process.argv

/**
 * @typedef {Object} Args
 *
 * @property {string} url
 * @property {boolean} no-window
 */

/** @type {mri.Argv<Args>} */
const cliArgs = mri(argv, {
  alias: {
    u: 'url'
  }
})

//region commandLine Flags
if (config.enableInProcessGPU) {
  app.commandLine.appendSwitch('in-process-gpu')
}
if (config.enableDisableRendererBackgrounding) {
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}
//endregion

/**
 * @param {BrowserWindow} mainWindow
 * @returns {Promise<number>}
 */
const createAppServer = (mainWindow) => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    // @ts-expect-error import.meta
    const dir = app.isPackaged ? join(import.meta.dirname, './app') : './src/app'

    const server = createServer((req, res) => {
      return serve(req, res, {
        maxAge: 0,
        public: dir
      })
    })

    const wss = new WebSocketServer({ server })
    wss.on('connection', function connection(ws) {
      ws.on('error', console.error)

      ws.on('message', async (data) => {
        //region Message handlers
        /** @type {import('@pipelab/core').Message} */
        const json = JSON.parse(data.toString())
        console.log('received:', json)

        switch (json.url) {
          case '/paths':
            await userFolder(json, ws, mainWindow)
            break

          case '/fs/file/write':
            await fsWrite(json, ws, mainWindow)
            break

          case '/fs/file/read':
            await fsRead(json, ws, mainWindow)
            break

          case '/fs/file/read/binary':
            await fsReadBinary(json, ws, mainWindow)
            break

          case '/fs/folder/create':
            await fsFolderCreate(json, ws, mainWindow)
            break

          case '/window/maximize':
            windowMaximize(json, ws, mainWindow)
            break

          case '/window/minimize':
            windowMinimize(json, ws, mainWindow)
            break
          case '/window/request-attention':
            windowRequestAttention(json, ws, mainWindow)
            break
          case '/window/restore':
            windowRestore(json, ws, mainWindow)
            break
          case '/dialog/folder':
            dialogFolder(json, ws, mainWindow)
            break
          case '/dialog/open':
            dialogOpen(json, ws, mainWindow)
            break
          case '/dialog/save':
            dialogSave(json, ws, mainWindow)
            break
          case '/window/set-always-on-top':
            windowSetAlwaysOnTop(json, ws, mainWindow)
            break
          case '/window/set-height':
            windowSetHeight(json, ws, mainWindow)
            break
          case '/window/set-maximum-size':
            windowSetMaximumSize(json, ws, mainWindow)
            break
          case '/window/set-minimum-size':
            windowSetMinimumSize(json, ws, mainWindow)
            break
          case '/window/set-resizable':
            windowSetResizable(json, ws, mainWindow)
            break
          case '/window/set-title':
            windowSetTitle(json, ws, mainWindow)
            break
          case '/window/set-width':
            windowSetWidth(json, ws, mainWindow)
            break
          case '/window/set-x':
            windowSetX(json, ws, mainWindow)
            break
          case '/window/set-y':
            windowSetY(json, ws, mainWindow)
            break
          case '/window/show-dev-tools':
            windowShowDevTools(json, ws, mainWindow)
            break
          case '/window/unmaximize':
            windowUnmaximize(json, ws, mainWindow)
            break
          case '/engine':
            engine(json, ws, mainWindow)
            break
          case '/open':
            open(json, ws, mainWindow)
            break
          case '/show-in-explorer':
            showInExplorer(json, ws, mainWindow)
            break
          case '/run':
            run(json, ws, mainWindow)
            break
          case '/fs/copy':
            throw new Error('Not implemented')
          case '/fs/delete':
            throw new Error('Not implemented')
          case '/fs/exist':
            throw new Error('Not implemented')
          case '/fs/file/append':
            throw new Error('Not implemented')
          case '/fs/list':
            fsList(json, ws, mainWindow)
            break
          case '/fs/file/size':
            fsFileSize(json, ws, mainWindow)
            break
          case '/fs/move':
            throw new Error('Not implemented')

          default:
            console.log('unsupported', data)
            assertUnreachable(json)
            break
        }
      })
    })

    server.listen(31753, () => {
      const adress = server.address()
      if (adress && typeof adress !== 'string') {
        return resolve(adress.port)
      }
      throw new Error('Unable to bind server: adress is not an object')
    })
  })
}

const createWindow = async () => {
  const argUrl = cliArgs.url

  // If there is a window
  const mainWindow = new BrowserWindow({
    width: config.width,
    height: config.height,
    fullscreen: config.fullscreen,
    frame: config.frame,
    transparent: config.transparent,
    // toolbar: config.toolbar,
    alwaysOnTop: config.alwaysOnTop,
    webPreferences: {
      // @ts-expect-error import.meta
      preload: join(import.meta.dirname, 'preload.js')
    }
  })

  // Clear service workers to prevent old versions of the app
  await session.defaultSession.clearStorageData({
    storages: ['serviceworkers']
  })

  if (argUrl) {
    console.log('argUrl', argUrl)
    await mainWindow?.loadURL(argUrl)
  } else {
    const port = await createAppServer(mainWindow)

    console.log('port', port)

    await mainWindow?.loadURL(`http://localhost:${port}`)
  }
}

const registerHandlers = async () => {
  ipcMain.on('exit', (event, code) => {
    console.log('exit', code)
    app.exit(code)
  })
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
