import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, Server } from "node:http";
import { useLogger } from "@pipelab/shared";
import { WebSocket as WSWebSocket } from "ws";

const websocketMocks = vi.hoisted(() => {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const server = {
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      handlers[event] = listener;
      return server;
    }),
    close: vi.fn((callback?: () => void) => callback?.()),
  };
  return {
    handlers,
    server,
    WebSocketServer: vi.fn(function MockWebSocketServer() {
      return server;
    }),
  };
});

vi.mock("ws", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ws")>();
  return { ...actual, WebSocketServer: websocketMocks.WebSocketServer };
});

import { WebSocketServer } from "./websocket-server";
import { useAPI } from "./ipc-core";

describe("WebSocket request logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(websocketMocks.handlers)) delete websocketMocks.handlers[key];
    websocketMocks.WebSocketServer.mockClear();
  });

  it("forwards initiator values without logging workflow secrets", async () => {
    const { handle } = useAPI();
    const secret = "websocket-client-secret";
    const connectionSecret = "websocket-connection-secret";
    let received: unknown;
    handle("workflow:execute", async (_event, { value }) => {
      received = value;
    });
    const debug = vi.spyOn(useLogger().logger(), "debug");
    const server = new WebSocketServer();
    const httpServer = {
      listening: true,
      on: vi.fn(),
      address: () => ({ port: 3000 }),
      close: vi.fn(),
    } as unknown as Server;
    await server.start(3000, httpServer);

    const clientListeners: Record<string, (data: Buffer) => void> = {};
    const client = {
      url: "ws://localhost",
      readyState: WSWebSocket.OPEN,
      on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        clientListeners[event] = listener;
      }),
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WSWebSocket;
    const request = { headers: {}, url: "/" } as IncomingMessage;
    websocketMocks.handlers.connection?.(client, request);
    clientListeners.message?.(
      Buffer.from(
        JSON.stringify({
          channel: "workflow:execute",
          requestId: "request-1",
          data: {
            name: "workflows/release",
            env: { PUBLISH_TOKEN: secret },
            connectionValues: { itch: { apiKey: connectionSecret } },
            connectionOverrides: [
              {
                alias: "steam-release",
                field: "password",
                value: { kind: "literal", value: connectionSecret },
              },
            ],
          },
        }),
      ),
    );
    await Promise.resolve();

    expect(JSON.stringify(debug.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(debug.mock.calls)).not.toContain(connectionSecret);
    expect(received).toEqual({
      name: "workflows/release",
      env: { PUBLISH_TOKEN: secret },
      connectionValues: { itch: { apiKey: connectionSecret } },
      connectionOverrides: [
        {
          alias: "steam-release",
          field: "password",
          value: { kind: "literal", value: connectionSecret },
        },
      ],
    });
    await server.stop();
  });
});
