import { Channels, Data, End, Events, ShellChannels } from "@pipelab/shared";
import { useLogger } from "@pipelab/shared";
import { useWebSocketAPI } from "./websocket-client";
import { WebSocketListener } from "@pipelab/shared";
import { useUIStore } from "../store/ui";

// Re-export for backwards compatibility
export type { WebSocketListener };

export const useAPI = () => {
  const { logger } = useLogger();
  const { execute: wsExecute, isConnected, on: wsOn } = useWebSocketAPI();
  const uiStore = useUIStore();

  /**
   * Send an order and wait for its execution
   */
  const execute = async <KEY extends Channels>(
    channel: KEY,
    data?: Data<KEY>,
    listener?: WebSocketListener<KEY>,
  ): Promise<End<KEY>> => {
    // If it's a shell channel and we are in Electron, use IPC
    if (ShellChannels.includes(channel)) {
      if (window.electron) {
        logger().debug("Routing to Electron IPC:", channel);

        const requestId = Math.random().toString(36).substring(7);

        return new Promise((resolve, reject) => {
          const cancel = window.electron.ipcRenderer.on(channel, (_event, response) => {
            if (response.type === "end") {
              cancel();
              resolve(response.data);
            } else {
              listener?.(response);
            }
          });

          window.electron.ipcRenderer.send(channel, {
            requestId,
            data,
          });
        });
      } else {
        // Fallback for headless mode
        if (channel === "dialog:showOpenDialog") {
          logger().debug("Falling back to web file picker (open):", data);
          const result = await uiStore.showFilePicker({
            ...(data as any),
            mode: "open",
          });
          return {
            type: "success",
            result,
          } as any;
        } else if (channel === "dialog:showSaveDialog") {
          logger().debug("Falling back to web file picker (save):", data);
          const result = await uiStore.showFilePicker({
            ...(data as any),
            mode: "save",
          });
          return {
            type: "success",
            result,
          } as any;
        }
      }
    }

    try {
      const result = await wsExecute(channel, data, listener);

      return result;
    } catch (error) {
      logger().error("API execution error:", error);
      throw error;
    }
  };

  /**
   * Send an order (for backwards compatibility)
   */
  const send = <KEY extends Channels>(channel: KEY, data?: Data<KEY>) => {
    logger().warn("useAPI.send() is deprecated. Use useAPI.execute() instead.");
    return execute(channel, data);
  };

  /**
   * On method (placeholder for backwards compatibility)
   */
  const on = <KEY extends Channels>(
    channel: KEY | string,
    listener: (data: Events<KEY>) => void,
  ) => {
    return wsOn(channel, listener);
  };

  return {
    send,
    on,
    execute,
    isConnected,
  };
};

export type UseAPI = ReturnType<typeof useAPI>;
