#!/usr/bin/env node
import cac from 'cac'
import {
  registerIPCHandlers,
  setSystemContext,
  WebSocketServer
} from '@pipelab/core-node'
import { registerAllHandlers } from '@pipelab/core-node/heavy'
import { join } from 'path'
import { homedir } from 'os'
import http from 'http'
import handler from 'serve-handler'

const cli = cac('pipelab')

cli
  .command('serve', 'Start the standalone WebSocket server')
  .option('-p, --port <port>', 'Port to listen on', { default: 33753 })
  .option('--user-data <path>', 'Custom user data path')
  .action(async (options) => {
    const isDev = process.env.NODE_ENV === 'development'
    const userDataPath =
      options.userData || join(homedir(), '.config', '@pipelab', isDev ? 'app-dev' : 'app')

    // In dev, assets are in ../assets relative to dist/index.js
    // In pkg, they are also in ../assets relative to the bundled dist/index.js
    const assetsPath = join(__dirname, '..', 'assets')
    const uiPath = join(assetsPath, 'ui')

    // Setup minimal context for headless mode
    setSystemContext({
      userDataPath,
      assetsPath,
      showOpenDialog: async () => {
        console.error('showOpenDialog is not supported in CLI mode')
        return { canceled: true, filePaths: [] }
      },
      showSaveDialog: async () => {
        console.error('showSaveDialog is not supported in CLI mode')
        return { canceled: true, filePath: undefined }
      },
      getMainWindow: () => undefined,
      getPluginAPI: () => ({
        send: () => {},
        on: () => () => {},
        execute: async () => {}
      })
    })

    const server = http.createServer((request, response) => {
      return handler(request, response, {
        public: uiPath
      })
    })

    console.log(`Starting Pipelab server on port ${options.port}...`)
    console.log(`UI available at http://localhost:${options.port}`)

    registerAllHandlers()
    registerIPCHandlers()
    const wsServer = new WebSocketServer()
    await wsServer.start(Number(options.port), server)
  })

cli.help()
cli.version('1.0.0')
cli.parse()
