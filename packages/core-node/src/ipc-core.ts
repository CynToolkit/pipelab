import { Channels, IpcMessage } from "@pipelab/shared/apis";
import { WebSocket as WSWebSocket } from "ws";
import { useLogger } from "@pipelab/shared/logger";
import {
  WebSocketEvent,
  WebSocketHandler,
  WebSocketSendFunction,
} from "@pipelab/shared/websocket.types";

export type HandleListenerSendFn<KEY extends Channels> = WebSocketSendFunction<KEY>;

export type WsEvent = WebSocketEvent;

export type HandleListener<KEY extends Channels> = WebSocketHandler<KEY>;

const handlers: Record<string, WebSocketHandler<any>> = {};

export const useAPI = () => {
  const { logger } = useLogger();

  const handle = <KEY extends Channels>(channel: KEY, listener: WebSocketHandler<KEY>) => {
    handlers[channel] = listener;

    return {
      channel,
      listener,
    };
  };

  const processWebSocketMessage = (ws: WSWebSocket, channel: string, message: IpcMessage) => {
    const { data, requestId } = message;

    if (handlers[channel]) {
      logger().debug("Executing handler for channel:", channel, "with data:", JSON.stringify(data));
      const event: WsEvent = {
        sender: ws.url || "websocket-client",
      };

      const send: HandleListenerSendFn<any> = (events) => {
        const serialized = JSON.stringify(events);
        logger().debug(
          "sending response to",
          requestId,
          ":",
          serialized.length > 500 ? serialized.substring(0, 500) + "..." : serialized,
        );
        const response = {
          type: "response",
          requestId,
          events,
        };
        ws.send(JSON.stringify(response), (error) => {
          if (error) {
            logger().error("Failed to send WebSocket response:", error);
          }
        });
        return Promise.resolve();
      };

      return handlers[channel](event, {
        send,
        value: data,
      });
    } else {
      logger().warn("No handler found for channel:", channel);
    }
  };

  return {
    handle,
    processWebSocketMessage,
    handlers,
  };
};

export const registerIPCHandlers = (filter?: (channel: Channels) => boolean) => {
  const { handlers } = useAPI();
  const { logger } = useLogger();

  logger().info("registering ipc handlers");

  const isRenderer = () => {
    return typeof process === "undefined" || process.type === "renderer";
  };

  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.electron &&
    !isRenderer()
  ) {
    const { ipcMain } = require("electron");

    for (const [channel, listener] of Object.entries(handlers)) {
      if (filter && !filter(channel as Channels)) {
        continue;
      }

      logger().debug("Registering Electron IPC handler:", channel);

      ipcMain.on(channel, async (event: any, message: IpcMessage) => {
        const { data, requestId } = message;

        const send: HandleListenerSendFn<any> = async (events) => {
          event.reply(channel, {
            type: "response",
            requestId,
            events,
          });
        };

        try {
          await listener({ sender: "electron-ipc" }, { send, value: data });
        } catch (error) {
          logger().error(`Error in IPC handler for ${channel}:`, error);
          send({
            type: "end",
            data: {
              type: "error",
              ipcError: error instanceof Error ? error.message : "Unknown error",
            },
          });
        }
      });
    }
  }
};
