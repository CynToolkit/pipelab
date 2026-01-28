// @ts-check

import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron'
import { dirname, join } from 'node:path'
// @ts-expect-error no types
import serve from 'serve-handler'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import './custom-main.js'
import mri from 'mri'
import config from '../config.cjs'
import steamworks from '@pipelab/steamworks.js'
import DiscordRPC from 'discord-rpc'

// user
import userFolder from './handlers/user/folder.js'

// fs
import fsWrite from './handlers/fs/write.js'
import fsWriteBase64 from './handlers/fs/write-base64.js'
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
import exit from './handlers/general/exit.js'

// steam raw
import steamRaw from './handlers/steam/raw.js'
import steamUploadScore from './handlers/steam/uploadScore.js'
import steamDownloadScore from './handlers/steam/downloadScore.js'
import steamUpdateItem from './handlers/steam/updateItem.js'
import steamGetItem from './handlers/steam/getItem.js'
import steamGetItems from './handlers/steam/getItems.js'
import steamSubscribe from './handlers/steam/subscribe.js'
import steamUnsubscribe from './handlers/steam/unsubscribe.js'
import steamState from './handlers/steam/state.js'
import steamInstallInfo from './handlers/steam/installInfo.js'
import steamDownloadInfo from './handlers/steam/downloadInfo.js'
import steamDownload from './handlers/steam/download.js'
import steamDeleteItem from './handlers/steam/deleteItem.js'

// discord set activity
import discordSetActivity from './handlers/discord/set-activity.js'

import { getAppName } from './utils.js'

import infos from './handlers/general/infos.js'

import semver from 'semver'

/**
 * Assert switch is exhaustive
 * @param {never} _x
 * @returns {never}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assertUnreachable(_x) {
  throw new Error("Didn't expect to get here")
}

safeStorage.setUsePlainTextEncryption(true)

function createErrorWindow(errorMessage) {
  const errorWindow = new BrowserWindow({
    width: 600,
    height: 250,
    title: 'Game Startup Error',
    center: true,
    resizable: false,
    webPreferences: {
      preload: join(metaDirname, 'preload.js')
    }
  })

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Error</title>
        <style>
          /* Basic reset and modern styling */
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #2c2f33; /* Dark background */
            color: #ffffff;             /* White text */
            overflow: hidden;
          }
          /* Flexbox container to center content */
          body {
            display: flex;
            flex-direction: column;
            justify-content: center; /* Center horizontally */
            align-items: center;     /* Center vertically */
            text-align: center;
            padding: 1rem;
            gap: 1.5rem;
          }
          h1 {
            font-weight: 400; /* Lighter font weight */
            font-size: 1.2rem;
            line-height: 1.5;
            margin: 0;
          }
          .button-container {
            margin-top: 0.5rem;
          }
          button {
            background-color: #404448; /* Slightly lighter dark background */
            color: #ffffff;
            border: 1px solid #55585c;
            border-radius: 6px;
            padding: 0.75rem 1.5rem;
            font-family: inherit;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s ease, border-color 0.2s ease;
          }
          button:hover {
            background-color: #4a4e52;
            border-color: #60646a;
          }
          button:active {
            background-color: #363a3e;
            transform: translateY(1px);
          }
          button:focus {
            outline: none;
            box-shadow: 0 0 0 2px rgba(85, 88, 92, 0.5);
          }
        </style>
      </head>
      <body>
        <h1>${errorMessage}</h1>
        <div class="button-container">
          <button onclick="exitApplication()">Close</button>
        </div>
        <script>
          function exitApplication() {
            window.electronAPI.exit()
          }
        </script>
      </body>
    </html>
  `

  // Encode the HTML and load it as a data URL
  const encodedHtml = encodeURIComponent(htmlContent)
  errorWindow.loadURL(`data:text/html,${encodedHtml}`)
  return errorWindow
}

process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error, error.code)

  if (error.code === 'EADDRINUSE') {
    const errorWindow = await createErrorWindow(
      'Unable to start the game.<br>Is another instance already running?'
    )
    errorWindow.show()
    errorWindow.on('closed', () => {
      app.quit()
    })
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason)
})

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

/** @type {undefined | Object} */
let rpc
if (config.enableDiscordSupport) {
  DiscordRPC.register(config.discordAppId)
  rpc = new DiscordRPC.Client({ transport: 'ipc' })
  console.log('rpc', rpc)
}

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

// Fix stea remote play together
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess')
//endregion

const hasElectronVersion = config.electronVersion !== undefined && config.electronVersion !== ''
const isCJSOnly =
  hasElectronVersion && semver.lt(semver.coerce(config.electronVersion) || '0.0.0', '28.0.0')

//region Steam

/** @type {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} */
let client
console.log('config.enableSteamSupport', config.enableSteamSupport)
if (config.enableSteamSupport) {
  app.commandLine.appendSwitch('in-process-gpu')
  app.commandLine.appendSwitch('disable-direct-composition')
  app.commandLine.appendSwitch('no-sandbox')

  // const isNecessary = steamworks.restartAppIfNecessary(config.steamGameId)
  // console.log('isNecessary', isNecessary)

  // if (isNecessary) {

  // }

  try {
    client = steamworks.init(config.steamGameId)
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
 * @type {Set<import('ws').WebSocket>}
 */
const clients = new Set()

/**
 * @type {import('http').Server | null}
 */
let httpServer = null

/**
 * @type {import('ws').WebSocketServer | null}
 */
let wss = null

/**
 * @type {boolean}
 */
let isQuitting = false

/**
 * @param {string} message
 */
const broadcastMessage = (message) => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

const metaDirname = isCJSOnly ? __dirname : import.meta.dirname
const dir = app.isPackaged ? join(metaDirname, './app') : './src/app'

/**
 * @param {BrowserWindow} mainWindow
 * @returns {Promise<number>}
 */
const createAppServer = (mainWindow, serveStatic = true) => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    httpServer = createServer()
    const server = httpServer

    if (serveStatic) {
      server.on('request', (req, res) => {
        return serve(req, res, {
          headers: [
            {
              source: '**/*',
              headers: [
                {
                  key: 'Cache-Control',
                  value: 'no-cache'
                },
                {
                  key: 'Access-Control-Allow-Origin',
                  value: '*'
                }
              ]
            }
          ],
          public: dir
        })
      })
    } else {
      server.on('request', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*') // or 'https://preview.construct.net'
        res.setHeader('Access-Control-Allow-Private-Network', 'true')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Pipelab Electron App Server\n')
      })
    }

    try {
      wss = new WebSocketServer({ server })
      wss.on('connection', function connection(ws) {
        clients.add(ws)

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

              case '/fs/file/write-base64':
                await fsWriteBase64(json, ws)
                break

              case '/fs/file/read':
                await fsRead(json, ws)
                break

              case '/fs/file/read/binary':
                await fsReadBinary(json, ws)
                break

              case '/fs/folder/create':
                await fsFolderCreate(json, ws)
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
                await dialogFolder(json, ws)
                break
              case '/dialog/open':
                await dialogOpen(json, ws)
                break
              case '/dialog/save':
                await dialogSave(json, ws)
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
                await engine(json, ws)
                break
              case '/open':
                await open(json, ws)
                break
              case '/show-in-explorer':
                await showInExplorer(json, ws)
                break
              case '/run':
                await run(json, ws)
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
                await fsList(json, ws)
                break
              case '/fs/file/size':
                await fsFileSize(json, ws)
                break
              case '/fs/move':
                await fsMove(json, ws)
                break
              case '/steam/raw':
                await steamRaw(json, ws, client)
                break
              case '/steam/leaderboard/upload-score':
                await steamUploadScore(json, ws, client)
                break
              case '/steam/leaderboard/download-score':
                await steamDownloadScore(json, ws, client)
                break
              case '/steam/workshop/update-item':
                await steamUpdateItem(json, ws, client)
                break
              case '/steam/workshop/get-item':
                await steamGetItem(json, ws, client)
                break
              case '/steam/workshop/get-items':
                await steamGetItems(json, ws, client)
                break
              case '/steam/workshop/subscribe':
                await steamSubscribe(json, ws, client)
                break
              case '/steam/workshop/unsubscribe':
                await steamUnsubscribe(json, ws, client)
                break
              case '/steam/workshop/state':
                await steamState(json, ws, client)
                break
              case '/steam/workshop/install-info':
                await steamInstallInfo(json, ws, client)
                break
              case '/steam/workshop/download-info':
                await steamDownloadInfo(json, ws, client)
                break
              case '/steam/workshop/download':
                await steamDownload(json, ws, client)
                break
              case '/steam/workshop/delete-item':
                await steamDeleteItem(json, ws, client)
                break
              case '/discord/set-activity':
                await discordSetActivity(json, ws, mainWindow, rpc)
                break
              case '/exit':
                await exit(json, ws)
                break
              case '/window/fullscreen-state':
                // sent the other way around
                break
              case '/infos':
                await infos(json, ws)
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
                  success: false,
                  error: e.message
                }
              })
            )
          }
        })

        ws.on('close', () => {
          clients.delete(ws)
        })
      })
    } catch (e) {
      console.error('Unable to create websocket server', e)
      return reject(e)
    }

    server.listen(31753, '127.0.0.1', () => {
      const adress = server.address()
      if (adress && typeof adress !== 'string') {
        return resolve(adress.port)
      }
      return reject('Unable to bind server: adress is not an object')
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
    backgroundColor: config.backgroundColor,
    icon: config.icon,
    webPreferences: {
      preload: join(metaDirname, 'preload.js')
    },
    show: true
  })

  if (!mainWindow) {
    throw new Error('Unable to create window')
  }

  if (!config.toolbar) {
    mainWindow.setMenu(null)
  }

  if (config.openDevtoolsOnStart) {
    mainWindow.webContents.openDevTools()
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
    await createAppServer(mainWindow, false)

    await mainWindow?.loadURL(argUrl)
    console.log('URL loaded')
  } else {
    const port = await createAppServer(mainWindow)

    const url = `http://localhost:${port}`
    await mainWindow?.loadURL(url)
    console.log('URL loaded (static)', url)
  }

  mainWindow.on('enter-full-screen', () => {
    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').FullscreenState, 'input'>}
     */
    const order = {
      url: '/window/fullscreen-state',
      body: {
        state: 'fullscreen'
      }
    }
    broadcastMessage(JSON.stringify(order))
  })

  mainWindow.on('leave-full-screen', () => {
    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').FullscreenState, 'input'>}
     */
    const order = {
      url: '/window/fullscreen-state',
      body: {
        state: 'normal'
      }
    }
    broadcastMessage(JSON.stringify(order))
  })

  mainWindow.webContents?.setWindowOpenHandler(({ url }) => {
    // Open the URL in the default browser
    shell.openExternal(url)
    return { action: 'deny' } // Prevent Electron from creating a new window
  })

  return mainWindow
}

/**
 * Cleanup all resources before quitting
 */
const cleanup = () => {
  return new Promise((resolve) => {
    console.log('Cleaning up resources...')

    // Close all WebSocket clients
    for (const client of clients) {
      try {
        client.close()
      } catch (e) {
        console.error('Error closing WebSocket client:', e)
      }
    }
    clients.clear()

    // Close WebSocket server
    if (wss) {
      try {
        wss.close()
      } catch (e) {
        console.error('Error closing WebSocket server:', e)
      }
      wss = null
    }

    // Close HTTP server
    if (httpServer) {
      httpServer.close(() => {
        console.log('HTTP server closed')
        httpServer = null
        resolve()
      })
      // Force resolve after timeout in case server doesn't close cleanly
      setTimeout(resolve, 500)
    } else {
      resolve()
    }
  })
}

const registerHandlers = async () => {
  ipcMain.on('exit', async (event, code) => {
    console.log('exit', code)
    isQuitting = true
    await cleanup()
    app.exit(code)
  })
}

const rpcLogin = async () => {
  return new Promise((resolve, reject) => {
    rpc.on('ready', () => {
      console.log('rpc  ready')
      return resolve(rpc)
    })

    rpc.login({ clientId: config.discordAppId }).catch((e) => {
      return reject(e)
    })
  })
}

app.whenReady().then(async () => {
  await registerHandlers()

  if (config.enableSteamSupport) {
    console.log('Enabling steam overlay support')
    try {
      steamworks.electronEnableSteamOverlay()
    } catch (e) {
      console.error('e', e)
    }
  }

  const mainWindow = await createWindow()

  mainWindow.show()

  if (config.enableDiscordSupport && rpc) {
    try {
      await rpcLogin()
    } catch (e) {
      console.error('e', e)
    }
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault()
    isQuitting = true
    cleanup().then(() => {
      app.quit()
    })
  }
})

app.on('will-quit', () => {
  // Final cleanup - synchronous operations only
  // Close any remaining WebSocket clients
  for (const client of clients) {
    try {
      client.terminate() // Force close
    } catch (e) {
      // Ignore errors during final cleanup
    }
  }
  clients.clear()
})

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until explicitly quit
  // But for games, we usually want to quit when the window is closed
  if (process.platform !== 'darwin' || isQuitting) {
    app.quit()
  } else {
    // On macOS, trigger the quit process which will run cleanup
    isQuitting = true
    cleanup().then(() => {
      app.quit()
    })
  }
})
