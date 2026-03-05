#!/usr/bin/env node
import cac from 'cac'
import { WebSocketServer, registerIPCHandlers, setSystemContext } from '@pipelab/core-node'
import { join } from 'path'
import { homedir } from 'os'

const cli = cac('pipelab')

cli
  .command('serve', 'Start the standalone WebSocket server')
  .option('-p, --port <port>', 'Port to listen on', { default: 33753 })
  .option('--user-data <path>', 'Custom user data path')
  .action(async (options) => {
    const isDev = process.env.NODE_ENV === 'development'
    const userDataPath =
      options.userData || join(homedir(), '.config', '@pipelab', isDev ? 'app-dev' : 'app')

    // Setup minimal context for headless mode
    setSystemContext({
      userDataPath,
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

    console.log(`Starting Pipelab server on port ${options.port}...`)
    registerIPCHandlers()
    const server = new WebSocketServer()
    await server.start(Number(options.port))
  })

cli.help()
cli.version('1.0.0')
cli.parse()
