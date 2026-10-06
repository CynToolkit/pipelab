import { expect, it, vi } from "vitest";
import http from "node:http";
import { WebSocket as WebSocketClient } from "ws";
import { sendStartupReady } from "./server";
import { webSocketServer } from "./websocket-server";
import { WebSocketServer } from "./websocket-server";

it("the host emits the startup completion event consumed by the UI", () => {
  const broadcast = vi.spyOn(webSocketServer, "broadcast").mockImplementation(() => {});
  try {
    sendStartupReady();
    expect(broadcast).toHaveBeenCalledWith("startup:progress", { type: "done" });
  } finally {
    broadcast.mockRestore();
  }
});

it("replays the sticky startup done event to clients that connect late", async () => {
  const httpServer = http.createServer();
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected the test HTTP server to listen on a TCP port");
  }

  const server = new WebSocketServer();
  await server.start(address.port, httpServer);
  server.broadcast("startup:progress", { type: "done" });

  const client = new WebSocketClient(`ws://127.0.0.1:${address.port}`);
  try {
    const replayedMessage = await new Promise<unknown>((resolve, reject) => {
      client.once("message", (data) => resolve(JSON.parse(data.toString())));
      client.once("error", reject);
    });

    expect(replayedMessage).toEqual({
      type: "event",
      channel: "startup:progress",
      data: { type: "done" },
    });
  } finally {
    await new Promise<void>((resolve) => {
      if (client.readyState === WebSocketClient.CLOSED) {
        resolve();
        return;
      }
      client.once("close", () => resolve());
      client.close();
    });
    await server.stop();
  }
});
