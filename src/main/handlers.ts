import { Channels, Data, Events, Message } from '@@/apis'
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { getFinalPlugins } from './utils'
import { dirname, join } from 'node:path'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { presets } from './presets/list'
import { handleActionExecute, handleConditionExecute } from './handler-func'
import { useLogger } from '@@/logger'

export type HandleListenerSendFn<KEY extends Channels> = (events: Events<KEY>) => void

export type HandleListener<KEY extends Channels> = (
  event: Electron.IpcMainInvokeEvent,
  data: { value: Data<KEY>; send: HandleListenerSendFn<KEY> }
) => Promise<void>

export const useAPI = () => {
  const { logger } = useLogger()

  const handle = <KEY extends Channels>(channel: KEY, listener: HandleListener<KEY>) => {
    return ipcMain.on(channel, (event, message: Message) => {
      const { data, requestId } = message
      // logger.info('received event', requestId)
      // logger.info('received data', data)

      const send: HandleListenerSendFn<KEY> = (events) => {
        logger().debug('sending', events, 'to', requestId)
        return event.sender.send(requestId, events)
      }

      return listener(event, {
        send,
        value: data
      })
    })
  }

  return {
    handle
  }
}

export const registerIPCHandlers = () => {
  const { handle } = useAPI()
  const { logger } = useLogger()

  logger().info('registering ipc handlers')

  handle('dialog:showOpenDialog', async (event, { value, send }) => {
    const slash = (await import('slash')).default

    // logger().info('event', event)
    logger().info('value', value)
    logger().info('dialog:showOpenDialog')

    const mainWindow = BrowserWindow.fromWebContents(event.sender)

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
    logger().info('value', value)
    logger().info('fs:read')

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

    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    if (!mainWindow) {
      logger().error('mainWindow not found')
      return
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, value)

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

  handle('action:execute', async (event, { send, value }) => {
    const { nodeId, params, pluginId } = value

    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    const result = await handleActionExecute(nodeId, pluginId, params, mainWindow)

    await send({
      data: result,
      type: 'end'
    })
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

  handle('config:save', async (_, { send, value }) => {
    const { data, config } = value

    const userData = app.getPath('userData')

    const filesPath = join(userData, 'config', config + '.json')

    // create parent folder
    await mkdir(dirname(filesPath), {
      recursive: true
    })

    // ensure file exist
    try {
      await access(filesPath)
    } catch {
      // File doesn't exist, create it
      await writeFile(filesPath, '{}') // json
    }

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
}
