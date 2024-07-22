import { app, shell, BrowserWindow, dialog, autoUpdater } from 'electron'
import { join } from 'path'
import { platform } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// @ts-expect-error
import icon from '../assets/icon.png?asset'
import { registerIPCHandlers } from './main/handlers'
import { usePlugins } from '@@/plugins'
import { parseArgs, ParseArgsConfig } from "node:util";
import { processGraph } from '@@/graph'
import { readFile, writeFile } from 'fs/promises'
import { getFinalPlugins } from '@main/utils'
import { SavedFile } from '@@/model'
import { handleActionExecute, handleConditionExecute } from '@main/handler-func'
// import * as Sentry from "@sentry/electron/main";
import { logger } from '@@/logger'
import Bugsnag from '@bugsnag/electron'

const isLinux = platform() === "linux";

logger.info("app.isPackaged", app.isPackaged);
logger.info("process.env.TEST", process.env.TEST);
logger.info("isLinux", isLinux);

if (!isLinux && process.env.TEST !== 'true' && require('electron-squirrel-startup')) app.quit();

if (app.isPackaged || true) {
  // Sentry.init({
  //   dsn: "https://757630879674735027fa5700162253f7@o45694.ingest.us.sentry.io/4507621723144192",
  // });
  Bugsnag.start({ apiKey: '91e1c09abbf0f9bf369b28ea99396093' })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      devTools: true,// is.dev
    }
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

const { registerBuiltIn } = usePlugins()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  autoUpdater.setFeedURL({
    url: 'https://github.com/CynToolkit/cyn/releases/latest/download',
    headers: {
      'Cache-Control': 'no-cache',
    },
  })

  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    const dialogOpts: Electron.MessageBoxOptions = {
      type: 'info',
      buttons: ['Restart', 'Later'],
      title: 'Application Update',
      message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail:
        'A new version has been downloaded. Restart the application to apply the updates.'
    }

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (message) => {
    console.error('There was a problem updating the application')
    console.error(message)
  })

  autoUpdater.on('update-available', (info) => {
    logger.info('Found update')
  })

  autoUpdater.on('update-not-available', (info) => {
    logger.info('No update available')
  })

  autoUpdater.on('checking-for-update', (info) => {
    logger.info('checking-for-update', info)
  })

  logger.info('app ready')
  autoUpdater.checkForUpdates()
  logger.info('autoUpdater.getFeedURL()', autoUpdater.getFeedURL())

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.cyn')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIPCHandlers()
  await registerBuiltIn()
  // registerOtherPlugins()

  const config = {
    options: {
      project: {
        type: "string",
        short: "p",
      },
      action: {
        type: "string",
        short: "a",
      },
      output: {
        type: "string",
        short: "o",
      },
    },
  } satisfies ParseArgsConfig;

  logger.info('config', config)

  const {
    values,
  } = parseArgs(config);

  logger.info('values', values)

  // exit if values are passed
  if (Object.keys(values).length > 0) {
    logger.info('Processing graph...')

    const { action, project, output } = values

    if (action === "run") {
      const rawData = await readFile(project, 'utf8')
      const data = JSON.parse(rawData) as SavedFile

      logger.info('data', data)

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
          logger.info('onNodeEnter', node.uid)
        },
        onNodeExit: (node) => {
          logger.info('onNodeExit', node.uid)
        },
        onExecuteItem: (node, params, steps) => {
          if (node.type === 'condition') {
            return handleConditionExecute(node.origin.nodeId, node.origin.pluginId, params, {
              send: (data) => {
                logger.info('send', data)
              }
            })
          } else if (node.type === 'action') {
            return handleActionExecute(node.origin.nodeId, node.origin.pluginId, params, {
              send: (data) => {
                logger.info('send', data)
              }
            })
          } else {
            throw new Error('Unhandled type ' + node.type)
          }
        }
      })

      if (output) {
        await writeFile(output, JSON.stringify(result, null, 2), "utf8")
      }
    }

    process.exit(0)
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
