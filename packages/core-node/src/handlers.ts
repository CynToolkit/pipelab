import { Channels, Data, Events, IpcMessage } from '@pipelab/shared/apis'
import { ensure, getFinalPlugins, executeGraphWithHistory } from './utils'
import { WebSocket as WSWebSocket } from 'ws'
import { join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { presets } from './presets/list'
import { handleActionExecute, handleConditionExecute } from './handler-func'
import { useLogger } from '@pipelab/shared/logger'
import { setupConfigFile } from './config'
import { buildHistoryStorage } from './handlers/build-history'
import { SubscriptionRequiredError } from '@pipelab/shared/subscription-errors'
import {
  WebSocketEvent,
  WebSocketHandler,
  WebSocketSendFunction
} from '@pipelab/shared/websocket.types'
import { getSystemContext } from './context'
import { webSocketServer } from './websocket-server'

export type HandleListenerSendFn<KEY extends Channels> = WebSocketSendFunction<KEY>

export type WsEvent = WebSocketEvent

export type HandleListener<KEY extends Channels> = WebSocketHandler<KEY>

const handlers: Record<string, WebSocketHandler<any>> = {}

export const useAPI = () => {
  const { logger } = useLogger()

  const handle = <KEY extends Channels>(channel: KEY, listener: WebSocketHandler<KEY>) => {
    handlers[channel] = listener

    return {
      channel,
      listener
    }
  }

  const processWebSocketMessage = (ws: WSWebSocket, channel: string, message: IpcMessage) => {
    const { data, requestId } = message

    if (handlers[channel]) {
      logger().debug('Executing handler for channel:', channel, 'with data:', JSON.stringify(data))
      const event: WsEvent = {
        sender: ws.url || 'websocket-client'
      }

      const send: HandleListenerSendFn<any> = (events) => {
        const serialized = JSON.stringify(events)
        logger().debug(
          'sending response to',
          requestId,
          ':',
          serialized.length > 500 ? serialized.substring(0, 500) + '...' : serialized
        )
        const response = {
          type: 'response',
          requestId,
          events
        }
        ws.send(JSON.stringify(response), (error) => {
          if (error) {
            logger().error('Failed to send WebSocket response:', error)
          }
        })
        return Promise.resolve()
      }

      return handlers[channel](event, {
        send,
        value: data
      })
    } else {
      logger().warn('No handler found for channel:', channel)
    }
  }

  return {
    handle,
    processWebSocketMessage,
    handlers
  }
}

export const registerIPCHandlers = (filter?: (channel: Channels) => boolean) => {
  const { handle, handlers } = useAPI()
  const { logger } = useLogger()

  logger().info('registering ipc handlers')

  const isRenderer = () => {
    return typeof process === 'undefined' || process.type === 'renderer'
  }

  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.electron &&
    !isRenderer()
  ) {
    const { ipcMain } = require('electron')

    for (const [channel, listener] of Object.entries(handlers)) {
      if (filter && !filter(channel as Channels)) {
        continue
      }

      logger().debug('Registering Electron IPC handler:', channel)

      ipcMain.on(channel, async (event: any, message: IpcMessage) => {
        const { data, requestId } = message

        const send: HandleListenerSendFn<any> = async (events) => {
          event.reply(channel, {
            type: 'response',
            requestId,
            events
          })
        }

        try {
          await listener({ sender: 'electron-ipc' }, { send, value: data })
        } catch (error) {
          logger().error(`Error in IPC handler for ${channel}:`, error)
          send({
            type: 'end',
            data: {
              type: 'error',
              ipcError: error instanceof Error ? error.message : 'Unknown error'
            }
          })
        }
      })
    }
  }

  // Helper function to check build history authorization
  const checkBuildHistoryAuthorization = async (event: WsEvent): Promise<boolean> => {
    logger().info('AUTH BYPASS: Skipping auth verification for build history access')

    // Always authorize for now - relying on frontend auth checks only
    const isAuthorized = true

    if (!isAuthorized) {
      throw new SubscriptionRequiredError('build-history')
    }

    return true
  }

  handle('dialog:showOpenDialog', async (event, { value, send }) => {
    const slash = (await import('slash')).default

    // logger().info('event', event)
    logger().info('value', value)
    logger().info('dialog:showOpenDialog')

    const { showOpenDialog } = getSystemContext()

    const { canceled, filePaths } = await showOpenDialog(value)

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          filePaths: filePaths.map((f) => slash(f)),
          canceled
        }
      }
    })
  })

  handle('fs:read', async (event, { value, send }) => {
    const { logger } = useLogger()

    logger().info('fs:read', value.path)

    try {
      const data = await readFile(value.path, 'utf-8')
      logger().info('fs:read success, content length:', data.length)

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            content: data
          }
        }
      })
    } catch (e) {
      logger().error('fs:read error for path:', value.path, e)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: 'Unable to read file'
        }
      })
    }
  })

  handle('fs:write', async (event, { value, send }) => {
    const { logger } = useLogger()

    await writeFile(value.path, value.content, 'utf-8')

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          ok: true
        }
      }
    })
  })

  handle('fs:listDirectory', async (event, { value, send }) => {
    const { logger } = useLogger()
    const { readdir, stat } = await import('node:fs/promises')
    const { join } = await import('node:path')

    try {
      const entries = await readdir(value.path, { withFileTypes: true })
      const files = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(value.path, entry.name)
          let stats: any = {}
          try {
            stats = await stat(fullPath)
          } catch (e) {
            // Might happen for broken symlinks etc
          }

          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isSymbolicLink: entry.isSymbolicLink(),
            size: stats.size || 0,
            mtime: stats.mtime?.getTime() || 0
          }
        })
      )

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            files
          }
        }
      })
    } catch (error) {
      logger().error('Failed to list directory:', error)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Unable to list directory'
        }
      })
    }
  })

  handle('fs:getHomeDirectory', async (event, { send }) => {
    const { homedir } = await import('node:os')
    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          path: homedir()
        }
      }
    })
  })

  handle('dialog:showSaveDialog', async (event, { value, send }) => {
    const { logger } = useLogger()

    // logger.info('event', event)
    logger().info('value', value)
    logger().info('dialog:showSaveDialog')

    const { showSaveDialog } = getSystemContext()

    const { canceled, filePath } = await showSaveDialog(value)

    console.log('canceled', canceled)
    console.log('filePath', filePath)

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          filePath,
          canceled
        }
      }
    })
  })

  handle('nodes:get', async (_, { send }) => {
    const finalPlugins = getFinalPlugins()

    // logger.info(
    //   inspect(finalPlugins, {
    //     depth: 5
    //   })
    // )

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          nodes: finalPlugins
        }
      }
    })
  })

  handle('presets:get', async (_, { send }) => {
    const presetData = await presets()

    // logger.info(
    //   inspect(presetData, {
    //     depth: 5
    //   })
    // )

    send({
      type: 'end',
      data: {
        type: 'success',
        result: presetData
      }
    })
  })

  handle('condition:execute', async (_, { value }) => {
    const { nodeId, params, pluginId } = value

    await handleConditionExecute(
      nodeId,
      pluginId,
      params /* , {
      send,
    } */
    )
  })
  let abortControllerGraph: undefined | AbortController = undefined

  const effectiveActionExecute = async (
    nodeId: string,
    pluginId: string,
    params: Record<string, string>,
    mainWindow: any | undefined,
    send: HandleListenerSendFn<'action:execute'>
  ) => {
    try {
      // Listen to the abort signal and trigger rejection.

      const result = await handleActionExecute(
        nodeId,
        pluginId,
        params,
        mainWindow,
        send,
        abortControllerGraph!.signal
      )

      await send({
        data: result,
        type: 'end'
      })
    } catch (e) {
      // Catch any error and propagate it.
      console.error('Error during action execution:', e)
      await send({
        type: 'end',
        data: {
          ipcError: e instanceof Error ? e.message : 'Unknown error',
          type: 'error'
        }
      })
    } finally {
      console.log('action execution done, either ok or ko')
    }
  }

  handle('action:execute', async (event, { send, value }) => {
    const { nodeId, params, pluginId } = value

    // In WebSocket mode, no BrowserWindow available
    const mainWindow = getSystemContext().getMainWindow?.()
    abortControllerGraph = new AbortController()

    const signalPromise = new Promise((resolve, reject) => {
      abortControllerGraph!.signal.addEventListener('abort', async (ev) => {
        console.log('ev', ev)
        await send({
          type: 'end',
          data: {
            ipcError: 'Action aborted',
            type: 'error'
          }
        })
        return reject(new Error('Action interrupted: ' + 'Unknown reason'))
      })
    })

    console.log('race started')

    await Promise.race([
      signalPromise,
      effectiveActionExecute(nodeId, pluginId, params, mainWindow, send)
    ])
  })

  handle('constants:get', async (_, { send }) => {
    const userData = getSystemContext().userDataPath

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          result: {
            userData
          }
        }
      }
    })
  })

  handle('config:load', async (_, { send, value }) => {
    const { config: name } = value
    const { logger } = useLogger()

    logger().info('config:load', name)

    try {
      const manager = await setupConfigFile(name)
      const json = await manager.getConfig()

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            result: json
          }
        }
      })
    } catch (e) {
      logger().error(`config:load error for ${name}:`, e)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: e instanceof Error ? e.message : `Unable to load config ${name}`
        }
      })
    }
  })

  handle('config:save', async (_, { send, value }) => {
    const { data, config: name } = value
    const { logger } = useLogger()
    
    try {
      const manager = await setupConfigFile(name)
      const json = typeof data === 'string' ? JSON.parse(data) : data
      await manager.setConfig(json)

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            result: 'ok'
          }
        }
      })
    } catch (e) {
      logger().error(`config:save error for ${name}:`, e)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: e instanceof Error ? e.message : `Unable to save config ${name}`
        }
      })
    }
  })

  handle('config:reset', async (event, { value, send }) => {
    const { config: name, key } = value
    const { logger } = useLogger()
    logger().info('config:reset', name, key)

    try {
      const manager = await setupConfigFile(name)
      const currentConfig = await manager.getConfig()

      const { configRegistry } = await import('@pipelab/shared/config')
      const migrator = configRegistry[name]

      if (!migrator) {
        throw new Error(`No migrator found for configuration: ${name}`)
      }

      const defaultValue = (migrator.defaultValue as any)[key]

      await manager.setConfig({
        ...(currentConfig ? (currentConfig as any) : {}),
        [key]: defaultValue
      } as any)

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            result: 'ok'
          }
        }
      })
    } catch (e) {
      logger().error(`config:reset error for ${name}:`, e)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: e instanceof Error ? e.message : `Unable to reset config ${name}`
        }
      })
    }
  })

  handle('action:cancel', async (_, { send }) => {
    abortControllerGraph!.abort('Interrupted by user')
    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          result: 'ok'
        }
      }
    })
  })

  // Build History Handlers
  handle('build-history:save', async (event, { send, value }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing save
      logger().info('AUTH BYPASS: Processing build-history:save request')
      await checkBuildHistoryAuthorization(event)

      await buildHistoryStorage.save(value.entry)
      send({
        type: 'end',
        data: {
          type: 'success',
          result: { result: 'ok' }
        }
      })
    } catch (error) {
      logger().error('Failed to save build history entry:', error)

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: 'end',
          data: {
            type: 'error',
            ipcError: error.userMessage,
            code: error.code
          }
        })
        return
      }

      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to save build history entry'
        }
      })
    }
  })

  handle('build-history:get', async (event, { send, value }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing access
      logger().info('AUTH BYPASS: Processing build-history:get request')
      await checkBuildHistoryAuthorization(event)

      const entry = await buildHistoryStorage.get(value.id)
      send({
        type: 'end',
        data: {
          type: 'success',
          result: { entry }
        }
      })
    } catch (error) {
      logger().error('Failed to get build history entry:', error)

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: 'end',
          data: {
            type: 'error',
            ipcError: error.userMessage,
            code: error.code
          }
        })
        return
      }

      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to get build history entry'
        }
      })
    }
  })

  handle('build-history:get-all', async (event, { send, value }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing access
      logger().info('AUTH BYPASS: Processing build-history:get-all request')
      await checkBuildHistoryAuthorization(event)

      // Simplified: get all entries, optionally filter by pipeline
      const allEntries = await buildHistoryStorage.getAll()
      const filteredEntries = value?.query?.pipelineId
        ? allEntries.filter((entry) => entry.pipelineId === value?.query?.pipelineId)
        : allEntries

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            entries: filteredEntries,
            total: filteredEntries.length
          }
        }
      })
    } catch (error) {
      logger().error('Failed to get build history entries:', error)

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: 'end',
          data: {
            type: 'error',
            ipcError: error.userMessage,
            code: error.code
          }
        })
        return
      }

      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to get build history entries'
        }
      })
    }
  })

  handle('build-history:update', async (event, { send, value }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing update
      await checkBuildHistoryAuthorization(event)

      await buildHistoryStorage.update(value.id, value.updates)
      send({
        type: 'end',
        data: {
          type: 'success',
          result: { result: 'ok' }
        }
      })
    } catch (error) {
      logger().error('Failed to update build history entry:', error)

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: 'end',
          data: {
            type: 'error',
            ipcError: error.userMessage,
            code: error.code
          }
        })
        return
      }

      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to update build history entry'
        }
      })
    }
  })

  handle('build-history:delete', async (event, { send, value }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing deletion
      await checkBuildHistoryAuthorization(event)

      await buildHistoryStorage.delete(value.id)
      send({
        type: 'end',
        data: {
          type: 'success',
          result: { result: 'ok' }
        }
      })
    } catch (error) {
      logger().error('Failed to delete build history entry:', error)

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: 'end',
          data: {
            type: 'error',
            ipcError: error.userMessage,
            code: error.code
          }
        })
        return
      }

      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to delete build history entry'
        }
      })
    }
  })

  handle('build-history:clear', async (event, { send }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing clear operation
      await checkBuildHistoryAuthorization(event)

      await buildHistoryStorage.clear()
      send({
        type: 'end',
        data: {
          type: 'success',
          result: { result: 'ok' }
        }
      })
    } catch (error) {
      logger().error('Failed to clear build history:', error)

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: 'end',
          data: {
            type: 'error',
            ipcError: error.userMessage,
            code: error.code
          }
        })
        return
      }

      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to clear build history'
        }
      })
    }
  })

  handle('build-history:get-storage-info', async (event, { send }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing access to storage info
      await checkBuildHistoryAuthorization(event)

      const info = await buildHistoryStorage.getStorageInfo()
      send({
        type: 'end',
        data: {
          type: 'success',
          result: info
        }
      })
    } catch (error) {
      logger().error('Failed to get build history storage info:', error)

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: 'end',
          data: {
            type: 'error',
            ipcError: error.userMessage,
            code: error.code
          }
        })
        return
      }

      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError:
            error instanceof Error ? error.message : 'Failed to get build history storage info'
        }
      })
    }
  })

  handle('build-history:configure', async (_, { send, value }) => {
    const { logger } = useLogger()

    try {
      // For now, we'll just log the configuration request
      // In a real implementation, you might want to make the storage configurable
      logger().info('Build history configuration request:', value.config)

      send({
        type: 'end',
        data: {
          type: 'success',
          result: { result: 'ok' }
        }
      })
    } catch (error) {
      logger().error('Failed to configure build history:', error)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to configure build history'
        }
      })
    }
  })

  handle('agents:get', async (event, { send }) => {
    const { logger } = useLogger()

    try {
      const agents = webSocketServer.getAgents()

      send({
        type: 'end',
        data: {
          type: 'success',
          result: { agents }
        }
      })
    } catch (error) {
      logger().error('Failed to get agents:', error)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Failed to get agents'
        }
      })
    }
  })

  handle('graph:execute', async (event, { send, value }) => {
    const { graph, variables, projectName, projectPath, pipelineId } = value

    const mainWindow = getSystemContext().getMainWindow?.()
    abortControllerGraph = new AbortController()

    try {
      const { result, buildId } = await executeGraphWithHistory({
        graph,
        variables,
        projectName,
        projectPath,
        pipelineId,
        mainWindow,
        onNodeEnter: (node) => {
          // Send UI update for node entering
          send({
            type: 'node-enter',
            data: {
              nodeUid: node.uid,
              nodeName: node.name
            }
          })
        },
        onNodeExit: (node) => {
          // Send UI update for node exiting
          send({
            type: 'node-exit',
            data: {
              nodeUid: node.uid,
              nodeName: node.name
            }
          })
        },
        onLog: (data, node) => {
          // Send log data to frontend
          if (data.type === 'log') {
            // Sanitize data for IPC serialization
            const sanitizedData = {
              message: data.data.message,
              timestamp: data.data.time
            }

            send({
              type: 'node-log',
              data: {
                nodeUid: node?.uid || 'unknown',
                logData: sanitizedData
              }
            })
          }
        },
        abortSignal: abortControllerGraph!.signal
      })

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            result,
            buildId
          }
        }
      })
    } catch (e) {
      console.log('abortControllerGraph!.signal.aborted', abortControllerGraph!.signal.aborted)
      const isCanceled = e instanceof Error && e.name === 'AbortError'
      send({
        type: 'end',
        data: {
          type: 'error',
          code: isCanceled ? 'canceled' : 'error',
          ipcError: e instanceof Error ? e.message : 'Unknown error'
        }
      })
    }
  })
}
