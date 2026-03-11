import { app, shell, BrowserWindow, dialog, autoUpdater, protocol, screen } from 'electron'
import { join } from 'path'
import { platform } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startServer, stopServer } from './main/server-process'
import { setSystemContext, registerIPCHandlers, setupConfigFile, assetsPath } from '@pipelab/core-node'
import { ShellChannels } from '@pipelab/shared/apis'
import { AppConfig } from '@pipelab/shared/config.schema'
import { parseArgs, ParseArgsConfig } from 'node:util'
import { mkdir } from 'fs/promises'
import { useLogger } from '@pipelab/shared/logger'
import * as Sentry from '@sentry/electron/main'
import { usePluginAPI } from '@pipelab/core-node'
import { resolve } from 'node:path'
import Squirrel from 'electron-squirrel-startup'

if (is.dev) {
  app.setPath('userData', app.getPath('userData') + '-dev')
  console.log('Dev mode: userData path set to', app.getPath('userData'))
}

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

let ext = '.png'
if (platform() === 'linux') {
  ext = '.png'
} else if (platform() === 'win32') {
  ext = '.ico'
} else if (platform() === 'darwin') {
  ext = '.icns'
}

const imagePath = join('./assets', 'build', `icon${ext}`)
// let isQuiting = false

if (
  !isLinux &&
  process.env.TEST !== 'true' &&
  app.isPackaged &&
  Squirrel
  // require('electron-squirrel-startup')
) {
  app.quit()
}

let api: any
let mainWindow: BrowserWindow | undefined

function createWindow(): void {
  const displays = screen.getAllDisplays()
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0
  })

  const position =
    externalDisplay && is.dev
      ? {
          x: externalDisplay.bounds.x + 50,
          y: externalDisplay.bounds.y + 50
        }
      : {}

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    icon: imagePath,
    autoHideMenuBar: true,
    ...position,
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

  console.log('process.env.UI_DEV_SERVER_URL', process.env.UI_DEV_SERVER_URL)

  // and load the index.html of the app.
  // if (is.dev && process.env.UI_DEV_SERVER_URL) {
  mainWindow.loadURL(process.env.UI_DEV_SERVER_URL)
  // } else if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  // mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  // } else {
  // mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  // }
}

if (is.dev && process.platform === 'win32') {
  app.setAsDefaultProtocolClient('pipelab', process.execPath, [resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('pipelab')
}

function handleProtocolUrl(url: string) {
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
  setSystemContext({
    userDataPath: app.getPath('userData'),
    assetsPath: app.isPackaged
      ? join(app.getAppPath(), '..', 'assets')
      : join(app.getAppPath(), '..', 'cli', 'assets'),
    showOpenDialog: (options) => {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (!mainWindow) throw new Error('No window')
      return dialog.showOpenDialog(mainWindow, options)
    },
    showSaveDialog: (options) => {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (!mainWindow) throw new Error('No window')
      return dialog.showSaveDialog(mainWindow, options)
    },
    getMainWindow: () => BrowserWindow.getFocusedWindow(),
    getPluginAPI: (mainWindow) => usePluginAPI(mainWindow)
  })

  protocol.handle('pipelab', async (request) => {
    const url = request.url
    console.log('handle url', url)
    await handleProtocolUrl(url)
    return new Response(null, { status: 200 })
  })

  if (!is.dev) {
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
    logger().info('autoUpdater.getFeedURL()', autoUpdater.getFeedURL())
  }

  logger().info('app ready')

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

  const settingsG = await setupConfigFile<AppConfig>('settings')

  const settings = await settingsG.getConfig()

  console.log('settings', settings)

  registerIPCHandlers((channel) => ShellChannels.includes(channel))

  // Start standalone CLI server
  try {
    await startServer()
    logger().info('Standalone server is ready, creating window')
  } catch (error) {
    logger().error('Failed to start standalone server:', error)
  }

  createWindow()

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
    // Stop standalone server before quitting
    stopServer()
    app.quit()
  }
})

// Handle app before quit to cleanup standalone server
app.on('before-quit', async (event) => {
  event.preventDefault()

  stopServer()
  logger().info('Standalone server stopped, quitting app')
  app.exit(0)
})
