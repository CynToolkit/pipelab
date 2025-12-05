import { Channels, Data, End, RequestId } from '@@/apis'
import { useLogger } from '@@/logger'
import { klona } from 'klona'
import { nanoid } from 'nanoid'
import { toRaw } from 'vue'
import {
  WebSocketSendFunction,
  WebSocketClientConfig,
  WebSocketConnectionState,
  WebSocketError,
  WebSocketConnectionError,
  WebSocketMessage,
  isWebSocketRequestMessage,
  isWebSocketResponseMessage,
  isWebSocketErrorMessage
} from '@@/websocket.types'
import { websocketPort } from 'src/constants'

export type WebSocketSendFn<KEY extends Channels> = WebSocketSendFunction<KEY>

// Message queue item interface
interface QueuedMessage {
  channel: Channels
  data?: any
  resolve: (value: any) => void
  reject: (reason: any) => void
  requestId: RequestId
  listener?: (event: any) => void
}


export class WebSocketClient {
  private ws: WebSocket | null = null
  private listeners: Map<string, (data: WebSocketMessage) => void> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnecting = false
  private connectionState: WebSocketConnectionState = 'disconnected'
  private stateChangeListeners: Set<(state: WebSocketConnectionState) => void> = new Set()
  private messageQueue: QueuedMessage[] = []

  constructor(private config: WebSocketClientConfig = {}) {
    const {
      url = `ws://localhost:${websocketPort}`,
      maxReconnectAttempts = 5,
      reconnectDelay = 1000
    } = config
    this.maxReconnectAttempts = maxReconnectAttempts
    this.reconnectDelay = reconnectDelay
    this.connect(url)
  }

  private connect(url?: string) {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.isConnecting = true
    this.connectionState = 'connecting'
    this.notifyStateChange()

    try {
      const connectionUrl = url || this.config.url || `ws://localhost:${websocketPort}`
      this.ws = new WebSocket(connectionUrl)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.connectionState = 'connected'
        this.notifyStateChange()

        const { logger } = useLogger()
        logger().debug('WebSocket client connected successfully')

        // Flush any queued messages now that connection is ready
        this.flushQueue()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event)
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', { code: event.code, reason: event.reason })
        this.isConnecting = false
        this.connectionState = 'disconnected'
        this.notifyStateChange()

        this.scheduleReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.isConnecting = false
        this.connectionState = 'error'
        this.notifyStateChange()
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      this.isConnecting = false
      this.connectionState = 'error'
      this.notifyStateChange()
      this.scheduleReconnect()
    }
  }

  private notifyStateChange() {
    this.stateChangeListeners.forEach((listener) => {
      try {
        listener(this.connectionState)
      } catch (error) {
        console.error('Error in state change listener:', error)
      }
    })
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      this.clearQueue()
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // Exponential backoff

    setTimeout(() => {
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      )
      this.connect()
    }, delay)
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message: WebSocketMessage = JSON.parse(event.data)

      if (isWebSocketResponseMessage(message) || isWebSocketErrorMessage(message)) {
        if (this.listeners.has(message.requestId)) {
          this.listeners.get(message.requestId)!(message)
        }
      } else if (isWebSocketRequestMessage(message)) {
        // Handle incoming request messages if needed
        console.log('Received request message:', message)
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  public send<KEY extends Channels>(
    channel: KEY,
    data?: Data<KEY>,
    listener?: (event: any) => void
  ): Promise<End<KEY>> {
    return new Promise((resolve, reject) => {
      const { logger } = useLogger()

      // If connection is not ready, queue the message
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        logger().debug('WebSocket not ready, queuing message:', { channel, hasData: !!data })

        const requestId = nanoid() as RequestId
        this.messageQueue.push({
          channel,
          data: toRaw(klona(data)),
          resolve,
          reject,
          requestId,
          listener
        })

        return
      }

      // Connection is ready, send immediately
      this.sendMessage(channel, data, resolve, reject, listener)
    })
  }

  private sendMessage<KEY extends Channels>(
    channel: KEY,
    data: Data<KEY> | undefined,
    resolve: (value: End<KEY>) => void,
    reject: (reason: any) => void,
    listener?: (event: any) => void
  ): void {
    const { logger } = useLogger()

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger().error('WebSocket send failed: connection not open')
      reject(new WebSocketConnectionError('WebSocket is not connected'))
      return
    }

    const requestId = nanoid() as RequestId
    const message: WebSocketMessage = {
      channel,
      requestId,
      data: toRaw(klona(data))
    }

    logger().debug('Sending WebSocket message:', {
      channel,
      requestId,
      hasData: !!data
    })


    this.listeners.set(requestId, (response: WebSocketMessage) => {
      if (isWebSocketErrorMessage(response)) {
        // Handle error messages immediately
        this.listeners.delete(requestId)
        reject(new WebSocketError(response.error, response.code, response.requestId))
      } else if (isWebSocketResponseMessage(response)) {
        // Handle the response events
        const endEvent = response.events

        if (endEvent.type === 'end') {
          // Only resolve and cleanup when we receive the final 'end' message
          this.listeners.delete(requestId)
          resolve(endEvent.data)
        } else {
          // Handle intermediate events - call the provided listener if available
          if (listener) {
            listener(endEvent)
          } else {
            logger().info('Received intermediate event:', {
              requestId,
              eventType: endEvent.type,
              hasData: !!endEvent.data
            })
          }
        }
      }
    })

    try {
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      this.listeners.delete(requestId)
      reject(
        new WebSocketError(
          `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      )
    }
  }

  private flushQueue(): void {
    const { logger } = useLogger()

    if (this.messageQueue.length === 0) {
      return
    }

    logger().debug(`Flushing ${this.messageQueue.length} queued messages`)

    // Create a copy of the queue and clear it
    const queuedMessages = [...this.messageQueue]
    this.messageQueue = []

    // Send all queued messages
    for (const queuedMessage of queuedMessages) {
      this.sendMessage(
        queuedMessage.channel,
        queuedMessage.data,
        queuedMessage.resolve,
        queuedMessage.reject,
        queuedMessage.listener
      )
    }
  }

  private clearQueue(): void {
    const { logger } = useLogger()

    if (this.messageQueue.length === 0) {
      return
    }

    logger().debug(
      `Clearing ${this.messageQueue.length} queued messages due to connection error/disconnect`
    )

    // Reject all queued messages
    for (const queuedMessage of this.messageQueue) {
      queuedMessage.reject(new WebSocketConnectionError('WebSocket connection lost'))
    }

    this.messageQueue = []
  }


  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  public disconnect() {
    this.connectionState = 'disconnected'
    this.notifyStateChange()

    // Clear any queued messages since we're disconnecting
    this.clearQueue()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.listeners.clear()
    this.reconnectAttempts = 0
  }

  public getConnectionState(): WebSocketConnectionState {
    return this.connectionState
  }

  public onStateChange(callback: (state: WebSocketConnectionState) => void): () => void {
    this.stateChangeListeners.add(callback)
    return () => {
      this.stateChangeListeners.delete(callback)
    }
  }

  public reconnect(url?: string) {
    this.disconnect()
    this.connect(url)
  }
}

// Global WebSocket client instance
let wsClient: WebSocketClient | null = null

export const getWebSocketClient = (): WebSocketClient => {
  if (!wsClient) {
    wsClient = new WebSocketClient()
  }
  return wsClient
}

export const useWebSocketAPI = () => {
  const { logger } = useLogger()
  const client = getWebSocketClient()

  /**
    * Send an order and wait for its execution
    */
  const execute = async <KEY extends Channels>(
    channel: KEY,
    data?: Data<KEY>,
    listener?: (event: any) => void
  ): Promise<End<KEY>> => {
    try {
      return await client.send(channel, data, listener)
    } catch (error) {
      logger().error('WebSocket API error:', error)
      throw error
    }
  }

  return {
    execute,
    isConnected: client.isConnected(),
    disconnect: client.disconnect.bind(client)
  }
}
