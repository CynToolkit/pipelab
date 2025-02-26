import { app, shell, BrowserWindow, dialog, autoUpdater, protocol } from 'electron'
import { join } from 'path'
import { platform } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// @ts-expect-error asset
import icon from '../assets/icon.png?asset'
import { registerIPCHandlers } from './main/handlers'
import { usePlugins } from '@@/plugins'
import { parseArgs, ParseArgsConfig } from 'node:util'
import { processGraph } from '@@/graph'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { getFinalPlugins } from '@main/utils'
import { SavedFile } from '@@/model'
import { handleActionExecute } from '@main/handler-func'
import { useLogger } from '@@/logger'
import * as Sentry from '@sentry/electron/main'
import { assetsPath } from '@main/paths'
import { usePluginAPI } from '@main/api'
import { setupConfig } from '@main/config'
import { resolve } from 'node:path'

const isLinux = platform() === 'linux'
// let tray
let isReadyToShow = false

const { logger, setMainWindow } = useLogger()

logger().info('app.isPackaged', app.isPackaged)
logger().info('process.env.TEST', process.env.TEST)
logger().info('process.env.WINEHOMEDIR', process.env.WINEHOMEDIR)
logger().info('isLinux', isLinux)

const isWine = platform() === 'win32' && 'WINEHOMEDIR' in process.env

// @ts-expect-error import.meta
const isCI = process.env.CI === 'true' || import.meta.env.CI === 'true'

if (app.isPackaged && process.env.TEST !== 'true' && !isWine && !isCI) {
  Sentry.init({
    dsn: 'https://757630879674735027fa5700162253f7@o45694.ingest.us.sentry.io/4507621723144192',
    debug: true
  })
}

const imagePath = join('./assets', 'build', 'icon.png')
// let isQuiting = false

if (
  !isLinux &&
  process.env.TEST !== 'true' &&
  app.isPackaged &&
  require('electron-squirrel-startup')
) {
  app.quit()
}

let api: any
let mainWindow: BrowserWindow | undefined

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    icon: imagePath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      devTools: is.dev
    }
  })

  setMainWindow(mainWindow)

  api = usePluginAPI(mainWindow)

  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('ready-to-show', () => {
    isReadyToShow = true
  })

  // TODO: only if minimize to tray enabled
  // mainWindow.on('minimize', function (event: Event) {
  //   event.preventDefault()
  //   mainWindow.hide()
  // })

  mainWindow.on('close', function () {
    app.quit()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

const { registerBuiltIn } = usePlugins()

if (is.dev && process.platform === 'win32') {
  app.setAsDefaultProtocolClient('pipelab', process.execPath, [resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('pipelab')
}

function handleProtocolUrl(url) {
  if (!url || !url.startsWith('pipelab://')) return

  // Parse the URL
  const urlObj = new URL(url)
  const path = urlObj.pathname.replace(/^\/+/, '')

  if (path === 'open') {
    // Handle pipelab://open
    console.log('Opening the app')
    // Your code to handle opening specific app view
  } else if (path === 'run') {
    // Handle pipelab://run?id=xxx
    const id = urlObj.searchParams.get('id')
    if (id) {
      console.log(`Running command with ID: ${id}`)
      // Your code to execute something with the ID
    }
  }
}

app.whenReady().then(async () => {
  protocol.handle('pipelab', async (request) => {
    const url = request.url
    console.log('handle url', url)
    await handleProtocolUrl(url)
  })

  autoUpdater.setFeedURL({
    url: 'https://github.com/CynToolkit/pipelab/releases/latest/download',
    headers: {
      'Cache-Control': 'no-cache'
    }
  })

  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    api?.execute('update:set-status', {
      status: 'update-downloaded'
    })
    logger().info('releaseNotes', releaseNotes)
    logger().info('releaseName', releaseName)
    logger().info('event', event)
    const dialogOpts: Electron.MessageBoxOptions = {
      type: 'info',
      buttons: ['Restart', 'Later'],
      title: 'Application Update',
      message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail: 'A new version has been downloaded. Restart the application to apply the updates.'
    }

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (message) => {
    api?.execute('update:set-status', {
      status: 'error'
    })
    logger().info('There was a problem updating the application')
    console.log(message)
  })

  autoUpdater.on('update-available', () => {
    api?.execute('update:set-status', {
      status: 'update-available'
    })
    logger().info('Found update')
  })

  autoUpdater.on('update-not-available', () => {
    api?.execute('update:set-status', {
      status: 'update-not-available'
    })
    logger().info('No update available')
  })

  autoUpdater.on('checking-for-update', (info: any) => {
    api?.execute('update:set-status', {
      status: 'checking-for-update'
    })
    logger().info('checking-for-update', info)
  })

  logger().info('app ready')
  logger().info('autoUpdater.getFeedURL()', autoUpdater.getFeedURL())

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.pipelab')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const assets = await assetsPath()
  const shimsPaths = join(assets, 'shims')

  await mkdir(shimsPaths, { recursive: true })

  if (platform() === 'win32') {
    const fakeNode = join(shimsPaths, 'node.bat')

    await writeFile(
      fakeNode,
      `REM @echo off

echo "Running fake node"

REM Set the environment variable to run Electron as Node.js
set ELECTRON_RUN_AS_NODE=1

ECHO %*

REM Shim Electron as Node.js
start "" "${process.execPath}" %*
`
    )
  } else {
    const fakeNode = join(shimsPaths, 'node')

    await writeFile(
      fakeNode,
      `#!/bin/bash

# Set the environment variable to run Electron as Node.js
export ELECTRON_RUN_AS_NODE=1

# Shim Electron as Node.js
exec "${process.execPath}" "$@"
`
    )
  }

  const settingsG = await setupConfig()

  const settings = await settingsG.getConfig()

  console.log('settings', settings)

  registerIPCHandlers()
  await registerBuiltIn()
  // registerOtherPlugins()

  const config = {
    options: {
      /** project: path to file .pipelab */
      project: {
        type: 'string',
        short: 'p'
      },
      /** action: run | open  */
      action: {
        type: 'string',
        short: 'a'
      },
      /** output: path to output result */
      output: {
        type: 'string',
        short: 'o'
      },
      inspect: {
        type: 'boolean'
      }
    }
  } satisfies ParseArgsConfig

  const { values } = parseArgs(config)

  logger().info('values', values)

  createWindow()

  delete values['inspect']

  // exit if values are passed
  if (Object.keys(values).length > 0) {
    logger().info('Processing graph...')

    const { action, project, output } = values

    if (action === 'run') {
      const rawData = await readFile(project, 'utf8')
      const data = JSON.parse(rawData) as SavedFile

      logger().info('data', data)

      const { canvas, variables } = data
      const { blocks: nodes } = canvas
      const pluginDefinitions = getFinalPlugins()

      const result = await processGraph({
        graph: nodes,
        definitions: pluginDefinitions,
        variables: variables,
        steps: {},
        context: {},
        onNodeEnter: (node) => {
          logger().info('onNodeEnter', node.uid)
        },
        onNodeExit: (node) => {
          logger().info('onNodeExit', node.uid)
        },
        onExecuteItem: (node, params /* , steps */) => {
          /* if (node.type === 'condition') {
            return handleConditionExecute(node.origin.nodeId, node.origin.pluginId, params, {
              send: (data) => {
                logger().info('send', data)
              }
            })
          } else  */ if (node.type === 'action') {
            return handleActionExecute(
              node.origin.nodeId,
              node.origin.pluginId,
              params,
              mainWindow,
              (data) => {
                logger().info('send', data)
              },
              new AbortController().signal
            )
          } else {
            throw new Error('Unhandled type ' + node.type)
          }
        }
      })

      if (output) {
        await writeFile(output, JSON.stringify(result, null, 2), 'utf8')
      }
    }

    process.exit(0)
  }

  // const icon = nativeImage.createFromPath(imagePath)
  // tray = new Tray(icon)
  // const contextMenu = Menu.buildFromTemplate([
  //   {
  //     label: 'Open',
  //     type: 'normal',
  //     click: () => {
  //       if (mainWindow) {
  //         mainWindow.show()
  //       }
  //     }
  //   },
  //   { type: 'separator' },
  //   {
  //     label: 'Exit',
  //     type: 'normal',
  //     click: () => {
  //       // isQuiting = true
  //       app.quit()
  //     }
  //   }
  // ])

  // tray.setContextMenu(contextMenu)
  // tray.on('click', () => {
  //   mainWindow.show()
  // })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.maximize()

    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates()
        console.log('checkForUpdates')
      }, 10000)
    }
  })
  if (isReadyToShow) {
    mainWindow.show()
    mainWindow.maximize()
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await client.shutdown()
    app.quit()
  }
})
