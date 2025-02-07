// @ts-check

import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { dirname, join } from 'node:path'
// @ts-expect-error no types
import serve from 'serve-handler'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import './custom-main.js'
import mri from 'mri'
import config from '../config.cjs'
import steamworks from 'steamworks.js'

// user
import userFolder from './handlers/user/folder.js'

// fs
import fsWrite from './handlers/fs/write.js'
import fsRead from './handlers/fs/read.js'
import fsReadBinary from './handlers/fs/read-binary.js'
import fsFolderCreate from './handlers/fs/folder-create.js'
import fsList from './handlers/fs/list.js'
import fsMove from './handlers/fs/move.js'
import fsDelete from './handlers/fs/delete.js'
import fsCopy from './handlers/fs/copy.js'
import fsFileSize from './handlers/fs/file-size.js'
import fsExist from './handlers/fs/exist.js'

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
import windowSetFullscreen from './handlers/window/set-fullscreen.js'

// dialog
import dialogFolder from './handlers/dialog/folder.js'
import dialogOpen from './handlers/dialog/open.js'
import dialogSave from './handlers/dialog/save.js'

// general
import engine from './handlers/general/engine.js'
import run from './handlers/general/run.js'
import open from './handlers/general/open.js'
import showInExplorer from './handlers/general/open-in-explorer.js'

// steam raw
import steamRaw from './handlers/steam/raw.js'
import { getAppName } from './utils.js'

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
if (config.forceHighPerformanceGpu) {
  app.commandLine.appendSwitch('force-high-performance-gpu')
}
//endregion

//region Steam

/** @type {Omit<import('steamworks.js').Client, "init" | "runCallbacks">} */
let client
console.log('config.enableSteamSupport', config.enableSteamSupport)
if (config.enableSteamSupport) {
  console.log('steamworks', steamworks)
  try {
    client = steamworks.init(config.steamGameId)
    console.log('client', client)
    console.log(client.localplayer.getName())
  } catch (e) {
    console.error('e', e)
  }
}
//endregion

const userData = app.getPath('userData')
const userDataDirname = dirname(userData)
const appNameFolder = getAppName(config)
const sessionDataPath = join(userDataDirname, `cache_${appNameFolder}`)
console.log('sessionDataPath', sessionDataPath)
app.setPath('userData', sessionDataPath)

/**
 * @param {BrowserWindow} mainWindow
 * @returns {Promise<number>}
 */
const createAppServer = (mainWindow, serveStatic = true) => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    // @ts-expect-error import.meta
    const dir = app.isPackaged ? join(import.meta.dirname, './app') : './src/app'

    const server = createServer()

    if (serveStatic) {
      server.on('request', (req, res) => {
        return serve(req, res, {
          maxAge: 0,
          public: dir,
          rewrites: [
            {
              source: 'sw.js',
              destination: 'index.html'
            }
          ]
        })
      })
    }

    const wss = new WebSocketServer({ server })
    wss.on('connection', function connection(ws) {
      ws.on('error', console.error)

      ws.on('message', async (data) => {
        //region Message handlers
        /** @type {import('@pipelab/core').Message} */
        const json = JSON.parse(data.toString())
        console.log('received:', json)

        try {
          switch (json.url) {
            case '/paths':
              await userFolder(json, ws, config)
              break

            case '/fs/file/write':
              await fsWrite(json, ws)
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
              await windowMaximize(json, ws, mainWindow)
              break

            case '/window/minimize':
              await windowMinimize(json, ws, mainWindow)
              break
            case '/window/request-attention':
              await windowRequestAttention(json, ws, mainWindow)
              break
            case '/window/restore':
              await windowRestore(json, ws, mainWindow)
              break
            case '/dialog/folder':
              await dialogFolder(json, ws, mainWindow)
              break
            case '/dialog/open':
              await dialogOpen(json, ws, mainWindow)
              break
            case '/dialog/save':
              await dialogSave(json, ws, mainWindow)
              break
            case '/window/set-always-on-top':
              await windowSetAlwaysOnTop(json, ws, mainWindow)
              break
            case '/window/set-height':
              await windowSetHeight(json, ws, mainWindow)
              break
            case '/window/set-maximum-size':
              await windowSetMaximumSize(json, ws, mainWindow)
              break
            case '/window/set-minimum-size':
              await windowSetMinimumSize(json, ws, mainWindow)
              break
            case '/window/set-resizable':
              await windowSetResizable(json, ws, mainWindow)
              break
            case '/window/set-title':
              await windowSetTitle(json, ws, mainWindow)
              break
            case '/window/set-width':
              await windowSetWidth(json, ws, mainWindow)
              break
            case '/window/set-x':
              await windowSetX(json, ws, mainWindow)
              break
            case '/window/set-y':
              await windowSetY(json, ws, mainWindow)
              break
            case '/window/show-dev-tools':
              await windowShowDevTools(json, ws, mainWindow)
              break
            case '/window/unmaximize':
              await windowUnmaximize(json, ws, mainWindow)
              break
            case '/window/set-fullscreen':
              await windowSetFullscreen(json, ws, mainWindow)
              break
            case '/engine':
              await engine(json, ws, mainWindow)
              break
            case '/open':
              await open(json, ws, mainWindow)
              break
            case '/show-in-explorer':
              await showInExplorer(json, ws, mainWindow)
              break
            case '/run':
              await run(json, ws, mainWindow)
              break
            case '/fs/copy':
              await fsCopy(json, ws)
              break
            case '/fs/delete':
              await fsDelete(json, ws)
              break
            case '/fs/exist':
              await fsExist(json, ws)
              break
            case '/fs/list':
              await fsList(json, ws, mainWindow)
              break
            case '/fs/file/size':
              await fsFileSize(json, ws, mainWindow)
              break
            case '/fs/move':
              await fsMove(json, ws)
              break
            case '/steam/raw':
              await steamRaw(json, ws, client)
              break

            default:
              console.log('unsupported', data)
              assertUnreachable(json)
              break
          }
        } catch (e) {
          console.error('e', e)
          ws.send(
            JSON.stringify({
              url: json.url,
              correlationId: json.correlationId,
              body: {
                error: e.message
              }
            })
          )
        }
      })
    })

    server.listen(31753, '127.0.0.1', () => {
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
    alwaysOnTop: config.alwaysOnTop,
    webPreferences: {
      // @ts-expect-error import.meta
      preload: join(import.meta.dirname, 'preload.js')
    }
  })

  if (!config.toolbar) {
    mainWindow.setMenu(null)
  }

  if (config.clearServiceWorkerOnBoot) {
    // It's better to export apps without service worker support
    // only use when needed
    try {
      // Clear service workers to prevent old versions of the app
      await session.defaultSession.clearStorageData({
        storages: ['serviceworkers']
      })
    } catch (e) {
      console.error('Error clearing service workers', e)
    }
  }

  if (argUrl) {
    console.log('argUrl', argUrl)
    const port = await createAppServer(mainWindow, false)

    console.log('port', port)

    await mainWindow?.loadURL(argUrl)
    console.log('URL loaded')
  } else {
    const port = await createAppServer(mainWindow)

    console.log('port', port)

    await mainWindow?.loadURL(`http://localhost:${port}`)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open the URL in the default browser
    shell.openExternal(url)
    return { action: 'deny' } // Prevent Electron from creating a new window
  })

  return mainWindow
}

const registerHandlers = async () => {
  ipcMain.on('exit', (event, code) => {
    console.log('exit', code)
    app.exit(code)
  })
}

app.whenReady().then(async () => {
  await registerHandlers()

  const mainWindow = await createWindow()

  mainWindow.show()

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

if (config.enableSteamSupport) {
  console.log('Enabling steam overlay support')
  steamworks.electronEnableSteamOverlay()
}
