import { klona } from "klona";
import { nanoid } from "nanoid";
import { toRaw } from "vue";
import { useLogger } from "./logger";
import type {
  RendererChannels,
  RendererData,
  RendererEnd,
  RendererEvents,
  RendererMessage,
  RequestId,
} from "./ipc.types";

export type ListenerMain<KEY extends RendererChannels> = (
  event: Electron.IpcMainEvent,
  data: RendererEvents<KEY>,
) => Promise<void>;

export const usePluginAPI = (browserWindow: any) => {
  const { logger } = useLogger();

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

  const execute = async <KEY extends RendererChannels>(
    channel: KEY,
    data?: RendererData<KEY>,
    listener?: ListenerMain<KEY>,
  ) => {
    const newId = nanoid() as RequestId;
    return new Promise<RendererEnd<KEY>>(async (resolve, reject) => {
      const message: RendererMessage = {
        requestId: newId,
        data: toRaw(klona(data)),
      };

      if (!browserWindow || browserWindow.isDestroyed()) {
        return reject(new Error("Browser window is destroyed"));
      }

      const cancel = on(newId, async (event, received) => {
        if (received.type === "end") {
          cancel();
          return resolve(received.data);
        }
        await listener?.(event, received);
      });

      try {
        browserWindow.webContents.send(channel, message);
      } catch (error) {
        logger().error(error);
        logger().error(channel, message);
        reject(error);
      }
    });
  };

  return { send, on, execute };
};

export type UseMainAPI = ReturnType<typeof usePluginAPI>;
