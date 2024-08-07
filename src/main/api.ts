import { BrowserWindow } from 'electron'
import { klona } from 'klona'
import { toRaw } from 'vue'

import { RendererPluginDefinition } from '@cyn/plugin-core'
import type { Tagged } from 'type-fest'

type Event<TYPE extends string, DATA> = { type: TYPE; data: DATA }
type EndEvent<DATA> = { type: 'end'; data: DATA }


export type IpcDefinition = {
  'dialog:alert': [
    // input
    { message: string; buttons?: { title: string; value: string }[] },
    EndEvent<{ answer: string }>
  ]
}

export type RendererChannels = keyof IpcDefinition
export type RendererData<KEY extends RendererChannels> = IpcDefinition[KEY][0]
export type RendererEvents<KEY extends RendererChannels> = IpcDefinition[KEY][1]
export type RendererEnd<KEY extends RendererChannels> = Extract<IpcDefinition[KEY][1], { type: 'end' }>['data']

export type RendererMessage = {
  // the channel to communicate
  requestId: RequestId
  data: any
}
export type RequestId = Tagged<string, 'request-id'>

// type Output = End<'fs:openFolder'>

export type HandleListenerSendFn<KEY extends RendererChannels> = (events: RendererEvents<KEY>) => void

export type HandleListener<KEY extends RendererChannels> = (
  event: Electron.IpcMainInvokeEvent,
  data: { value: RendererData<KEY>; send: HandleListenerSendFn<KEY> }
) => Promise<void>

export type ListenerMain<KEY extends RendererChannels> = (
  event: Electron.IpcMainEvent,
  data: RendererEvents<KEY>
) => Promise<void>

export const usePluginAPI = (browserWindow: BrowserWindow) => {
  /**
   * Send an order
   */
  const send = <KEY extends RendererChannels>(channel: KEY, args?: RendererData<KEY>) =>
    // browserWindow.webContents.send(channel, args)
    browserWindow.webContents.send(channel, args)

  const on = <KEY extends RendererChannels>(
    channel: KEY | string,
    listener: (event: Electron.IpcMainEvent, data: RendererEvents<KEY>) => void
  ) => {
    const ipcMain = browserWindow.webContents.ipc.on(channel, listener)

    const cancel = () => ipcMain.removeListener(channel, listener)

    return cancel
  }

  /**
   * Send an order and wait for it's execution
   */
  const execute = async <KEY extends RendererChannels>(
    channel: KEY,
    data?: RendererData<KEY>,
    listener?: ListenerMain<KEY>
  ) => {
    const { nanoid } = await import('nanoid')
    const newId = nanoid() as RequestId
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<RendererEnd<KEY>>(async (resolve) => {
      const message: RendererMessage = {
        requestId: newId,
        data: toRaw(klona(data))
      }

      const cancel = on(newId, async (event, data) => {
        // console.log('receiving event', event, data)
        if (data.type === 'end') {
          cancel()
          return resolve(data.data)
        } else {
          await listener?.(event, data)
        }
      })

      // send the message
      try {
        browserWindow.webContents.send(channel, message)
      } catch (e) {
        console.error(e)
        console.error(channel, message)
      }
    })
  }

  return {
    send,
    on,
    execute
  }
}

export type UseMainAPI = ReturnType<typeof usePluginAPI>
