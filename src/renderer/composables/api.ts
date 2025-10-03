import { Channels, Data, End, Events } from '@@/apis'
import { useLogger } from '@@/logger'
import { useWebSocketAPI } from './websocket-client'
import { WebSocketListener } from '@@/websocket.types'

// Re-export for backwards compatibility
export type { WebSocketListener }

export const useAPI = () => {
  const { logger } = useLogger()
  const { execute: wsExecute, isConnected } = useWebSocketAPI()

  /**
   * Send an order and wait for its execution
   */
  const execute = async <KEY extends Channels>(
    channel: KEY,
    data?: Data<KEY>,
    listener?: WebSocketListener<KEY>
  ): Promise<End<KEY>> => {
    try {
      const result = await wsExecute(channel, data, listener)

      return result
    } catch (error) {
      logger().error('API execution error:', error)
      throw error
    }
  }

  /**
   * Send an order (for backwards compatibility)
   */
  const send = <KEY extends Channels>(channel: KEY, data?: Data<KEY>) => {
    logger().warn('useAPI.send() is deprecated. Use useAPI.execute() instead.')
    return execute(channel, data)
  }

  /**
   * On method (placeholder for backwards compatibility)
   */
  const on = <KEY extends Channels>(
    channel: KEY | string,
    listener: (event: any, data: Events<KEY>) => void
  ) => {
    logger().warn('useAPI.on() is not supported in WebSocket mode. Use useAPI.execute() instead.')
    // Return a no-op function for backwards compatibility
    return () => {}
  }

  return {
    send,
    on,
    execute,
    isConnected
  }
}

export type UseAPI = ReturnType<typeof useAPI>
