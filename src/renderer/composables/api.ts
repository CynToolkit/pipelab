import { Channels, Data, End, Events, Message, RequestId } from '@@/apis'
import { useLogger } from '@@/logger'
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

export const useAPI = (
  pipe: {
    send: (channel: string, ...args: any[]) => void
    on: any
  } = window.electron.ipcRenderer
) => {
  const { logger } = useLogger()
  /**
   * Send an order
   */
  const send = <KEY extends Channels>(channel: KEY, args?: Data<KEY>) => pipe.send(channel, args)

  const on = <KEY extends Channels>(
    channel: KEY | string,
    listener: (event: Electron.IpcRendererEvent, data: Events<KEY>) => void
  ) => {
    // console.log('listening for', channel)
    return pipe.on(channel, listener)
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
        pipe.send(channel, message)
      } catch (e) {
        logger().error(e)
        logger().error(channel, message)
      }
    })
  }

  return {
    send,
    on,
    execute
  }
}

export type UseAPI = ReturnType<typeof useAPI>
