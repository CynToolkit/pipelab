import { Channels, Data, End, Events, Message, RequestId } from '@@/apis'
import { klona } from 'klona'
import { nanoid } from 'nanoid'
import { toRaw } from 'vue'

// type OnOptions = {
//   onMessage: (event: Electron.IpcRendererEvent, ...data: any[]) => Promise<void>
// }

export type Listener<KEY extends Channels> = (
  event: Electron.IpcRendererEvent,
  data: Events<KEY>
) => Promise<void>

export const useAPI = () => {
  /**
   * Send an order
   */
  const send = <KEY extends Channels>(channel: KEY, args?: Data<KEY>) =>
    // @ts-expect-error
    window.electron.ipcRenderer.send(channel, args)

  const on = <KEY extends Channels>(
    channel: KEY | string,
    listener: (event: Electron.IpcRendererEvent, data: Events<KEY>) => void
  ) => {
    // console.log('listening for', channel)
    // @ts-expect-error
    return window.electron.ipcRenderer.on(channel, listener)
  }

  /**
   * Send an order and wait for it's execution
   */
  const execute = async <KEY extends Channels>(
    channel: KEY,
    data?: Data<KEY>,
    listener?: Listener<KEY>
  ) => {
    const newId = nanoid() as RequestId
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<End<KEY>>(async (resolve) => {
      const message: Message = {
        requestId: newId,
        data: toRaw(klona(data))
      }
      // console.log(`${newId} for channel ${channel}`)
      const cancel = on(newId, async (event, data) => {
        // console.log('receiving event', event, data)
        if (data.type === 'end') {
          cancel()
          return resolve(data.data)
        } else {
          await listener?.(event, data)
        }
      })

      try {
        // @ts-expect-error
        window.electron.ipcRenderer.send(channel, message)
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
