import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WebSocketConnectionError,
  WebSocketError,
  type RequestId,
  type WebSocketMessage,
} from "@pipelab/shared";
import { WebSocketClient } from "./websocket-client";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  respond(message: WebSocketMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  close(): void {
    this.closeFromPeer();
  }

  closeFromPeer(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1006, reason: "connection lost" } as CloseEvent);
  }
}

const responseTo = (requestId: string): WebSocketMessage => ({
  type: "response",
  requestId: requestId as RequestId,
  events: { type: "end", data: { type: "success", result: { user: null } } },
});

const requestIdFrom = (socket: FakeWebSocket): string => {
  const request = JSON.parse(socket.sent[0]) as { requestId: string };
  return request.requestId;
};

describe("WebSocketClient pending request cleanup", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects in-flight and queued requests when the socket closes", async () => {
    const client = new WebSocketClient({ url: "ws://agent.test", maxReconnectAttempts: 0 });
    client.connect();
    const socket = FakeWebSocket.instances[0];
    const queuedRequest = client.send("auth:getUser");
    socket.closeFromPeer();

    await expect(queuedRequest).rejects.toBeInstanceOf(WebSocketConnectionError);

    const inFlightClient = new WebSocketClient({ url: "ws://agent.test", maxReconnectAttempts: 0 });
    inFlightClient.connect();
    const inFlightSocket = FakeWebSocket.instances[1];
    inFlightSocket.open();
    const inFlightRequest = inFlightClient.send("auth:getUser");
    inFlightSocket.closeFromPeer();
    await expect(inFlightRequest).rejects.toBeInstanceOf(WebSocketError);
  });

  it("rejects in-flight requests on explicit disconnect", async () => {
    const client = new WebSocketClient({ url: "ws://agent.test", maxReconnectAttempts: 0 });
    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    const request = client.send("auth:getUser");

    client.disconnect();

    await expect(request).rejects.toBeInstanceOf(WebSocketError);
  });

  it("cleans successful responses and sends normally after reconnect", async () => {
    const client = new WebSocketClient({ url: "ws://agent.test", maxReconnectAttempts: 0 });
    client.connect();
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    const completedRequest = client.send("auth:getUser");
    firstSocket.respond(responseTo(requestIdFrom(firstSocket)));
    await expect(completedRequest).resolves.toEqual({ type: "success", result: { user: null } });
    const oldClose = firstSocket.onclose;

    client.reconnect();
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.open();
    const nextRequest = client.send("auth:getUser");
    oldClose?.({ code: 1006, reason: "late close" } as CloseEvent);
    secondSocket.respond(responseTo(requestIdFrom(secondSocket)));

    await expect(nextRequest).resolves.toEqual({ type: "success", result: { user: null } });
  });
});
