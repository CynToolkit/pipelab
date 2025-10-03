import { Channels, Data, End } from '@@/apis'
import { useLogger } from '@@/logger'
import { getWebSocketClient, WebSocketClient } from './websocket-client'
import {
  WebSocketManager,
  WebSocketConnectionState,
  WebSocketClientConfig,
  WebSocketError,
  WebSocketConnectionError
} from '@@/websocket.types'

class WebSocketManagerImpl implements WebSocketManager {
  private client: WebSocketClient | null = null
  private stateChangeListeners: Set<(state: WebSocketConnectionState) => void> = new Set()
  private isInitialized = false

  async initialize(config?: WebSocketClientConfig): Promise<void> {
    if (this.isInitialized) {
      return
    }

    const { logger } = useLogger()

    try {
      this.client = getWebSocketClient()

      // Set up state change listener
      this.client.onStateChange((state) => {
        this.stateChangeListeners.forEach((listener) => {
          try {
            listener(state)
          } catch (error) {
            logger().error('Error in WebSocket state change listener:', error)
          }
        })
      })

      this.isInitialized = true
      logger().info('WebSocket manager initialized')
    } catch (error) {
      logger().error('Failed to initialize WebSocket manager:', error)
      throw new WebSocketConnectionError(
        `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async connect(url?: string): Promise<void> {
    if (!this.client) {
      await this.initialize()
    }

    if (!this.client) {
      throw new WebSocketConnectionError('WebSocket client not available')
    }

    const { logger } = useLogger()

    try {
      if (url && this.client.isConnected()) {
        this.client.disconnect()
      }

      if (url) {
        this.client.reconnect(url)
      } else {
        this.client.reconnect()
      }

      logger().info('WebSocket connection initiated', { url })
    } catch (error) {
      logger().error('Failed to connect WebSocket:', error)
      throw error
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect()
    }
  }

  send<KEY extends Channels>(channel: KEY, data?: Data<KEY>): Promise<End<KEY>> {
    if (!this.client) {
      throw new WebSocketConnectionError('WebSocket client not initialized')
    }

    if (!this.client.isConnected()) {
      throw new WebSocketConnectionError('WebSocket is not connected')
    }

    return this.client.send(channel, data)
  }

  isConnected(): boolean {
    return this.client?.isConnected() ?? false
  }

  getConnectionState(): WebSocketConnectionState {
    return this.client?.getConnectionState() ?? 'disconnected'
  }

  onStateChange(callback: (state: WebSocketConnectionState) => void): () => void {
    this.stateChangeListeners.add(callback)
    return () => {
      this.stateChangeListeners.delete(callback)
    }
  }

  getClient(): WebSocketClient | null {
    return this.client
  }

  async ensureConnection(url?: string): Promise<void> {
    const { logger } = useLogger()

    logger().debug('Ensuring WebSocket connection...', {
      hasClient: !!this.client,
      isConnected: this.client?.isConnected() ?? false,
      targetUrl: url
    })

    if (!this.client) {
      logger().debug('Initializing WebSocket client...')
      await this.initialize()
    }

    if (!this.client) {
      throw new WebSocketConnectionError('WebSocket client not available')
    }

    if (!this.client.isConnected()) {
      logger().debug('Connecting WebSocket client...')
      await this.connect(url)
      logger().info('WebSocket connection established successfully')
    } else {
      logger().debug('WebSocket already connected')
    }
  }
}

// Export singleton instance
export const websocketManager = new WebSocketManagerImpl()
