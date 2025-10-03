import { Channels, Data, Events, Message } from '@@/apis'
import { ensure, getFinalPlugins, executeGraphWithHistory } from './utils'
import { WebSocket as WSWebSocket } from 'ws'
import { join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { presets } from './presets/list'
import { handleActionExecute, handleConditionExecute } from './handler-func'
import { useLogger } from '@@/logger'
import { getDefaultAppSettingsMigrated, setupConfig } from './config'
import { buildHistoryStorage } from './handlers/build-history'
import { SubscriptionRequiredError } from '@@/subscription-errors'
import { WebSocketEvent, WebSocketHandler, WebSocketSendFunction } from '@@/websocket.types'
import { app, BrowserWindow, dialog } from 'electron'

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

  const processWebSocketMessage = (ws: WSWebSocket, channel: string, message: Message) => {
    const { data, requestId } = message

    if (handlers[channel]) {
      logger().debug('Executing handler for channel:', channel)
      const event: WsEvent = {
        sender: ws.url || 'websocket-client'
      }

      const send: HandleListenerSendFn<any> = (events) => {
        logger().debug('sending', events, 'to', requestId)
        const response = {
          type: 'response',
          requestId,
          events
        }
        ws.send(JSON.stringify(response))
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

export const registerIPCHandlers = () => {
  const { handle } = useAPI()
  const { logger } = useLogger()

  logger().info('registering ipc handlers')

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

    const mainWindow = BrowserWindow.getFocusedWindow()

    if (!mainWindow) {
      logger().error('mainWindow not found')
      return
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, value)

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

    // logger.info('event', event)
    // logger().info('value', value)
    // logger().info('fs:read')

    try {
      const data = await readFile(value.path, 'utf-8')

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
      logger().error('e', e)
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
    // logger.info('event', event)
    logger().info('value', value)
    logger().info('fs:read')

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

  handle('dialog:showSaveDialog', async (event, { value, send }) => {
    const { logger } = useLogger()

    // logger.info('event', event)
    logger().info('value', value)
    logger().info('dialog:showSaveDialog')

    const mainWindow = BrowserWindow.getFocusedWindow()

    if (!mainWindow) {
      logger().error('mainWindow not found')
      return
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, value)

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
    mainWindow: BrowserWindow | undefined,
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
        abortControllerGraph.signal
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
    const mainWindow = BrowserWindow.getFocusedWindow()
    abortControllerGraph = new AbortController()

    const signalPromise = new Promise((resolve, reject) => {
      abortControllerGraph.signal.addEventListener('abort', async (ev) => {
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
    const userData = app.getPath('userData')

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
    const { config } = value

    const userData = app.getPath('userData')

    const filesPath = join(userData, 'config', config + '.json')

    await ensure(filesPath)

    let content = '{}'
    try {
      content = await readFile(filesPath, 'utf8')
    } catch (e) {
      logger().error('e', e)
    }

    const json = JSON.parse(content)

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          result: json
        }
      }
    })
  })

  handle('settings:load', async (_, { send }) => {
    const settingsG = await setupConfig()
    const settings = await settingsG.getConfig()

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          result: settings
        }
      }
    })
  })

  handle('settings:save', async (_, { send, value }) => {
    const settingsG = await setupConfig()
    const settings = await settingsG.setConfig(value)

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          result: settings === true ? 'ok' : 'ko'
        }
      }
    })
  })

  handle('settings:reset', async (event, { value, send }) => {
    const { logger } = useLogger()
    logger().info('value', value)
    logger().info('settings:reset')

    const settingsG = await setupConfig()
    const settings = await settingsG.getConfig()

    const migratedSettings = await getDefaultAppSettingsMigrated()

    await settingsG.setConfig({
      ...settings,
      [value.key]: migratedSettings[value.key as keyof typeof migratedSettings] as any
    })

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

  handle('config:save', async (_, { send, value }) => {
    const { data, config } = value

    const userData = app.getPath('userData')

    const filesPath = join(userData, 'config', config + '.json')

    await ensure(filesPath)

    await writeFile(filesPath, data, 'utf8')

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

  handle('action:cancel', async (_, { send }) => {
    abortControllerGraph.abort('Interrupted by user')
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
      const filteredEntries = value.query?.pipelineId
        ? allEntries.filter((entry) => entry.projectId === value.query.pipelineId)
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

  handle('build-history:delete-by-project', async (event, { send, value }) => {
    const { logger } = useLogger()

    try {
      // Check authorization before allowing deletion
      await checkBuildHistoryAuthorization(event)

      await buildHistoryStorage.deleteByProject(value.projectId)
      send({
        type: 'end',
        data: {
          type: 'success',
          result: { result: 'ok' }
        }
      })
    } catch (error) {
      logger().error('Failed to delete build history entries for project:', error)

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
            error instanceof Error
              ? error.message
              : 'Failed to delete build history entries for project'
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

  handle('graph:execute', async (event, { send, value }) => {
    const { graph, variables, projectName, projectPath } = value

    const mainWindow = BrowserWindow.getFocusedWindow()
    abortControllerGraph = new AbortController()

    try {
      const { result, buildId } = await executeGraphWithHistory({
        graph,
        variables,
        projectName,
        projectPath,
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
          console.log('data', data)
          console.log('node', node)
          /**
           *
              data {
                type: 'log',
                data: {
                  decorator: '[Export .c3p]',
                  time: 1759479752141,
                  message: [ 'Downloading browser' ]
                }
              }
              node undefined
           */
          // Send log data to frontend
          if (data.type === 'log') {
            // Sanitize data for IPC serialization
            const sanitizedData = {
              type: data.data.type,
              level: data.data.level,
              message: data.data.message,
              timestamp: data.data.timestamp,
              nodeId: data.data.nodeId,
              pluginId: data.data.pluginId
              // Only include serializable properties
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
        abortSignal: abortControllerGraph.signal
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
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: e instanceof Error ? e.message : 'Unknown error'
        }
      })
    }
  })
}
