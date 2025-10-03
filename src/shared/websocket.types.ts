import { Channels, Data, Events, End, Message, RequestId } from './apis'
import { WebSocket as WSWebSocket } from 'ws'

// WebSocket connection states
export type WebSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'reconnecting'

// WebSocket server types
export interface WebSocketServerConfig {
  port?: number
  host?: string
  maxReconnectAttempts?: number
  reconnectDelay?: number
}

export interface WebSocketServerEvents {
  connection: (ws: WSWebSocket, request: IncomingMessage) => void
  message: (ws: WSWebSocket, data: Buffer) => void
  close: (ws: WSWebSocket) => void
  error: (ws: WSWebSocket, error: Error) => void
}

// WebSocket client types
export interface WebSocketClientConfig {
  url?: string
  maxReconnectAttempts?: number
  reconnectDelay?: number
  timeout?: number
}

export interface WebSocketClientEvents {
  open: () => void
  message: (event: MessageEvent) => void
  close: (event: CloseEvent) => void
  error: (error: Event) => void
}

// Unified WebSocket event types
export interface WebSocketEvent {
  sender: string
  timestamp?: number
}

// WebSocket message types
export interface WebSocketRequestMessage {
  channel: Channels
  requestId: RequestId
  data: any
}

export interface WebSocketResponseMessage {
  type: 'response'
  requestId: RequestId
  events: Events<any>
}

export interface WebSocketErrorMessage {
  type: 'error'
  requestId: RequestId
  error: string
  code?: string
}

export type WebSocketMessage =
  | WebSocketRequestMessage
  | WebSocketResponseMessage
  | WebSocketErrorMessage

// WebSocket connection info
export interface WebSocketConnectionInfo {
  id: string
  state: WebSocketConnectionState
  url: string
  connectedAt?: Date
  lastActivity?: Date
}

// Handler function types
export type WebSocketHandler<KEY extends Channels> = (
  event: WebSocketEvent,
  data: { value: Data<KEY>; send: WebSocketSendFunction<KEY> }
) => Promise<void>

export type WebSocketSendFunction<KEY extends Channels> = (events: Events<KEY>) => Promise<void>

// WebSocket listener types
export type WebSocketListener<KEY extends Channels> = (event: Events<KEY>) => Promise<void>

// WebSocket API interface
export interface WebSocketAPI {
  execute: <KEY extends Channels>(
    channel: KEY,
    data?: Data<KEY>,
    listener?: WebSocketListener<KEY>
  ) => Promise<End<KEY>>
  send: <KEY extends Channels>(channel: KEY, data?: Data<KEY>) => Promise<End<KEY>>
  on: <KEY extends Channels>(
    channel: KEY,
    listener: (event: WebSocketEvent, data: Events<KEY>) => void
  ) => () => void
  isConnected: () => boolean
  disconnect: () => void
}

// WebSocket manager interface
export interface WebSocketManager {
  connect: (url?: string) => Promise<void>
  disconnect: () => void
  send: <KEY extends Channels>(channel: KEY, data?: Data<KEY>) => Promise<End<KEY>>
  isConnected: () => boolean
  getConnectionState: () => WebSocketConnectionState
  onStateChange: (callback: (state: WebSocketConnectionState) => void) => () => void
}

// Error types
export class WebSocketError extends Error {
  constructor(
    message: string,
    public code?: string,
    public requestId?: RequestId
  ) {
    super(message)
    this.name = 'WebSocketError'
  }
}

export class WebSocketConnectionError extends WebSocketError {
  constructor(
    message: string,
    public url?: string
  ) {
    super(message)
    this.name = 'WebSocketConnectionError'
  }
}

export class WebSocketTimeoutError extends WebSocketError {
  constructor(
    message: string,
    public timeout: number,
    requestId?: RequestId
  ) {
    super(message)
    this.name = 'WebSocketTimeoutError'
  }
}

// Type guards
export const isWebSocketRequestMessage = (message: any): message is WebSocketRequestMessage => {
  return message && typeof message.channel === 'string' && message.requestId
}

export const isWebSocketResponseMessage = (message: any): message is WebSocketResponseMessage => {
  return message && message.type === 'response' && message.requestId && message.events
}

export const isWebSocketErrorMessage = (message: any): message is WebSocketErrorMessage => {
  return message && message.type === 'error' && message.requestId && message.error
}

// Utility types for better type inference
export type WebSocketMessageType<T extends Channels> = {
  channel: T
  requestId: RequestId
  data: Data<T>
}

export type WebSocketResponseType<T extends Channels> = {
  type: 'response'
  requestId: RequestId
  events: Events<T>
}

// Import for Node.js HTTP server
import { IncomingMessage } from 'http'
