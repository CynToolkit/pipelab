import { nanoid } from "nanoid";
import { klona } from "klona";
import { toRaw } from "vue";

import type { Tagged } from "type-fest";
import { ILogObjMeta } from "tslog";
import { useLogger } from "@pipelab/shared";

import {
  UpdateStatus,
  RendererChannels,
  RendererData,
  RendererEvents,
  RendererEnd,
  RendererMessage,
  RequestId,
  HandleListenerRendererSendFn,
  HandleListenerRenderer as BaseHandleListenerRenderer,
} from "@pipelab/shared";

export type {
  UpdateStatus,
  RendererChannels,
  RendererData,
  RendererEvents,
  RendererEnd,
  RendererMessage,
  RequestId,
  HandleListenerRendererSendFn,
};

export type HandleListenerRenderer<KEY extends RendererChannels> = (
  event: Electron.IpcMainInvokeEvent,
  data: { value: RendererData<KEY>; send: HandleListenerRendererSendFn<KEY> },
) => Promise<void>;

export type ListenerMain<KEY extends RendererChannels> = (
  event: Electron.IpcMainEvent,
  data: RendererEvents<KEY>,
) => Promise<void>;

export const usePluginAPI = (browserWindow: any) => {
  const { logger } = useLogger();
  /**
   * Send an order
   */
  const send = <KEY extends RendererChannels>(channel: KEY, args?: RendererData<KEY>) => {
    if (!browserWindow || browserWindow.isDestroyed()) return;
    browserWindow.webContents.send(channel, args);
  };

  const on = <KEY extends RendererChannels>(
    channel: KEY | string,
    listener: (event: any, data: RendererEvents<KEY>) => void,
  ) => {
    if (!browserWindow || browserWindow.isDestroyed()) return () => {};
    const ipcMain = browserWindow.webContents.ipc.on(channel, listener);

    const cancel = () => {
      if (browserWindow.isDestroyed()) return;
      ipcMain.removeListener(channel, listener);
    };

    return cancel;
  };

  /**
   * Send an order and wait for it's execution
   */
  const execute = async <KEY extends RendererChannels>(
    channel: KEY,
    data?: RendererData<KEY>,
    listener?: ListenerMain<KEY>,
  ) => {
    const newId = nanoid() as RequestId;
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<RendererEnd<KEY>>(async (resolve, reject) => {
      const message: RendererMessage = {
        requestId: newId,
        data: toRaw(klona(data)),
      };

      if (!browserWindow || browserWindow.isDestroyed()) {
        return reject(new Error("Browser window is destroyed"));
      }

      const cancel = on(newId, async (event, data) => {
        // console.log('receiving event', event, data)
        if (data.type === "end") {
          cancel();
          return resolve(data.data);
        } else {
          await listener?.(event, data);
        }
      });

      // send the message
      try {
        browserWindow.webContents.send(channel, message);
      } catch (e) {
        logger().error(e);
        logger().error(channel, message);
        reject(e);
      }
    });
  };

  return {
    send,
    on,
    execute,
  };
};

export type UseMainAPI = ReturnType<typeof usePluginAPI>;
