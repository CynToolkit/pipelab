import { Channels, IpcMessage } from "@pipelab/shared";
import { WebSocket as WSWebSocket } from "ws";
import { useLogger } from "@pipelab/shared";
import { WebSocketEvent, WebSocketHandler, WebSocketSendFunction } from "@pipelab/shared";

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

        if (ws.readyState === WSWebSocket.OPEN) {
          ws.send(JSON.stringify(response), (error) => {
            if (error) {
              logger().error("Failed to send WebSocket response:", error);
            }
          });
        } else {
          logger().debug(
            `Cannot send response to ${requestId}: WebSocket is not open (state: ${ws.readyState})`,
          );
        }
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
