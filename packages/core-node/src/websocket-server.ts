import { WebSocketServer as WSWebSocketServer, WebSocket as WSWebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { useAPI } from './ipc-core'
import { useLogger } from '@pipelab/shared/logger'
import {
  WebSocketServerConfig,
  WebSocketServerEvents,
  WebSocketConnectionState,
  WebSocketError,
  WebSocketMessage,
  isWebSocketRequestMessage,
  Agent
} from '@pipelab/shared/websocket.types'
import { websocketPort } from '@pipelab/constants'

export interface ConnectedClient {
  id: string
  name: string
  ws: WSWebSocket
  connectedAt: number
}

export class WebSocketServer {
  private wss: WSWebSocketServer | null = null
  private server: import('http').Server | null = null
  private isReady = false
  private readyResolve: (() => void) | null = null
  private connectionState: WebSocketConnectionState = 'disconnected'
  private clients: Map<WSWebSocket, ConnectedClient> = new Map()

  async start(port: number = websocketPort): Promise<void> {
    const { logger } = useLogger()
    const { nanoid } = await import('nanoid')

    return new Promise((resolve, reject) => {
      try {
        logger().info('Starting WebSocket server on port', port)

        // Create HTTP server for WebSocket
        const http = require('http')
        const server = http.createServer()
        this.server = server

        // Create WebSocket server
        this.wss = new WSWebSocketServer({ server })

        this.wss.on('connection', (ws: WSWebSocket, request: IncomingMessage) => {
          const clientId = nanoid()
          const clientName = `Agent ${clientId.substring(0, 4)}`
          const connectedAt = Date.now()

          const client: ConnectedClient = {
            id: clientId,
            name: clientName,
            ws,
            connectedAt
          }

          this.clients.set(ws, client)
          console.log('WebSocket client connected', {
            id: clientId,
            name: clientName,
            url: request.url
          })

          ws.on('message', (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString())
              logger().debug('Received WebSocket message:', message)
              this.handleWebSocketMessage(ws, message)
            } catch (error) {
              logger().error('Failed to parse WebSocket message:', error)
              this.sendError(ws, undefined, 'Invalid message format')
            }
          })

          ws.on('close', (code: number, reason: Buffer) => {
            const client = this.clients.get(ws)
            if (client) {
              logger().info('WebSocket client disconnected', {
                id: client.id,
                name: client.name,
                code,
                reason: reason.toString()
              })
              this.clients.delete(ws)
            }
          })

          ws.on('error', (error: Error) => {
            logger().error('WebSocket error:', error)
          })
        })

        server.listen(port, () => {
          this.connectionState = 'connected'
          logger().info(`WebSocket server listening on port ${port}`)
          this.isReady = true
          if (this.readyResolve) {
            this.readyResolve()
          }
          resolve()
        })

        server.on('error', (error: Error) => {
          this.connectionState = 'error'
          logger().error('WebSocket server error:', error)
          reject(new WebSocketError(`Server error: ${error.message}`))
        })
      } catch (error) {
        this.connectionState = 'error'
        logger().error('Failed to start WebSocket server:', error)
        reject(
          new WebSocketError(
            `Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        )
      }
    })
  }

  private async handleWebSocketMessage(ws: WSWebSocket, message: WebSocketMessage) {
    const { logger } = useLogger()
    const { processWebSocketMessage } = useAPI()

    try {
      if (isWebSocketRequestMessage(message)) {
        logger().debug('Processing WebSocket request message:', {
          channel: message.channel,
          requestId: message.requestId,
          hasData: !!message.data
        })

        logger().debug('Routing message to handler:', message.channel)
        await processWebSocketMessage(ws, message.channel, message)
        logger().debug('Handler processed message successfully')
      } else {
        logger().warn('Invalid message format received:', {
          type: message.type,
          requestId: message.requestId,
          hasError: 'error' in message
        })
        this.sendError(
          ws,
          message.requestId,
          'Invalid message format: missing channel or requestId'
        )
      }
    } catch (error) {
      logger().error('Error processing WebSocket message:', error)
      this.sendError(
        ws,
        message.requestId,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  private sendError(
    ws: WSWebSocket,
    requestId: string | undefined,
    errorMessage: string,
    code?: string
  ) {
    try {
      const errorResponse: any = {
        type: 'error',
        requestId,
        error: errorMessage,
        ...(code && { code })
      }
      ws.send(JSON.stringify(errorResponse))
    } catch (error) {
      console.error('Failed to send error response:', error)
    }
  }

  async stop(): Promise<void> {
    const { logger } = useLogger()

    return new Promise((resolve) => {
      this.isReady = false
      this.connectionState = 'disconnected'

      if (this.wss) {
        this.wss.close(() => {
          logger().info('WebSocket server closed')
          resolve()
        })
      } else {
        resolve()
      }

      if (this.server) {
        this.server.close()
      }
    })
  }

  waitForReady(): Promise<void> {
    if (this.isReady) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.readyResolve = resolve
    })
  }

  isServerReady(): boolean {
    return this.isReady
  }

  getConnectionState(): WebSocketConnectionState {
    return this.connectionState
  }

  getAgents(): Agent[] {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      name: client.name,
      isSelf: false, // This will be set by the client itself when receiving the list
      connectedAt: client.connectedAt
    }))
  }

  getClient(ws: WSWebSocket): ConnectedClient | undefined {
    return this.clients.get(ws)
  }
}

// Export singleton instance
export const webSocketServer = new WebSocketServer()
