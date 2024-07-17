import { Channels, Data, Events, Message } from '@@/apis'
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { usePlugins } from '@@/plugins'
import {
  ActionRunner,
  ConditionRunner,
  Condition,
  InputsDefinition,
  Action
} from '../shared/libs/plugin-core'
import { getFinalPlugins } from './utils'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { presets } from './presets/list'
import { isRequired } from '@@/validation'
import { handleActionExecute, handleConditionExecute } from './handler-func'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type HandleListenerSendFn<KEY extends Channels> = (events: Events<KEY>) => void

export type HandleListener<KEY extends Channels> = (
  event: Electron.IpcMainInvokeEvent,
  data: { value: Data<KEY>; send: HandleListenerSendFn<KEY> }
) => Promise<void>

export const useAPI = () => {
  const handle = <KEY extends Channels>(channel: KEY, listener: HandleListener<KEY>) => {
    return ipcMain.on(channel, (event, message: Message) => {
      const { data, requestId } = message
      // console.log('received event', requestId)
      // console.log('received data', data)

      const send: HandleListenerSendFn<KEY> = (events) => {
        console.log('sending', events, 'to', requestId)
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

  console.log('registering ipc handlers')

  handle('dialog:showOpenDialog', async (event, { value, send }) => {
    console.log('event', event)
    console.log('value', value)
    console.log('dialog:showOpenDialog')

    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    if (!mainWindow) {
      console.error('mainWindow not found')
      return
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, value)

    send({
      type: 'end',
      data: {
        filePaths,
        canceled
      }
    })
  })

  handle('fs:read', async (event, { value, send }) => {
    console.log('event', event)
    console.log('value', value)
    console.log('fs:read')

    try {
      const data = await readFile(value.path, 'utf-8')

      send({
        type: 'end',
        data: {
          content: data
        }
      })
    } catch (e) {
      console.error('e', e)
      send({
        type: 'end',
        data: {
          result: {
            ipcError: 'Unable to read file'
          }
        }
      })
    }
  })

  handle('fs:write', async (event, { value, send }) => {
    console.log('event', event)
    console.log('value', value)
    console.log('fs:read')

    await writeFile(value.path, value.content, 'utf-8')

    send({
      type: 'end',
      data: {
        ok: true
      }
    })
  })

  handle('dialog:showSaveDialog', async (event, { value, send }) => {
    console.log('event', event)
    console.log('value', value)
    console.log('dialog:showSaveDialog')

    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    if (!mainWindow) {
      console.error('mainWindow not found')
      return
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, value)

    send({
      type: 'end',
      data: {
        filePath,
        canceled
      }
    })
  })

  handle('nodes:get', async (_, { send }) => {
    const finalPlugins = getFinalPlugins()

    // console.log(
    //   inspect(finalPlugins, {
    //     depth: 5
    //   })
    // )

    send({
      type: 'end',
      data: {
        nodes: finalPlugins
      }
    })
  })

  handle('presets:get', async (_, { send }) => {
    const presetData = await presets()

    // console.log(
    //   inspect(presetData, {
    //     depth: 5
    //   })
    // )

    send({
      type: 'end',
      data: presetData
    })
  })

  handle('condition:execute', async (_, { send, value }) => {
    const { nodeId, params, pluginId } = value

    await handleConditionExecute(nodeId, pluginId, params, {
      send,
    })
  })

  handle('action:execute', async (_, { send, value }) => {
    const { nodeId, params, pluginId } = value

    const result = await handleActionExecute(nodeId, pluginId, params, {
      send,
    })

    // @ts-expect-error
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
        result: {
          userData
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
      console.error('e', e)
    }

    const json = JSON.parse(content)

    send({
      type: 'end',
      data: {
        result: json
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
        result: 'ok'
      }
    })
  })
}