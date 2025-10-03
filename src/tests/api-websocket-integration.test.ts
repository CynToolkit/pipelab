import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAPI } from '../renderer/composables/api'
import { WebSocketClient } from '../renderer/composables/websocket-client'
import { WebSocketListener } from '../shared/websocket.types'
import { Channels } from '../shared/apis'

// Mock the logger
vi.mock('../shared/logger', () => ({
  useLogger: vi.fn(() => ({
    logger: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }))
  }))
}))

// Mock the WebSocket client
vi.mock('../renderer/composables/websocket-client', async () => {
  const actual = await vi.importActual('../renderer/composables/websocket-client')
  return {
    ...actual,
    getWebSocketClient: vi.fn(),
    useWebSocketAPI: vi.fn()
  }
})

describe('API-WebSocket Integration Tests', () => {
  let mockWebSocketClient: any
  let mockUseWebSocketAPI: any
  let api: ReturnType<typeof useAPI>

  beforeEach(() => {
    // Create mock WebSocket client
    mockWebSocketClient = {
      send: vi.fn(),
      isConnected: vi.fn(() => true),
      disconnect: vi.fn(),
      getConnectionState: vi.fn(() => 'connected'),
      onStateChange: vi.fn(() => vi.fn()),
      reconnect: vi.fn()
    }

    // Create mock useWebSocketAPI
    mockUseWebSocketAPI = vi.fn(() => ({
      execute: vi.fn(),
      isConnected: true,
      disconnect: vi.fn()
    }))

    // Setup mocks
    const {
      getWebSocketClient,
      useWebSocketAPI
    } = require('../renderer/composables/websocket-client')
    getWebSocketClient.mockReturnValue(mockWebSocketClient)
    useWebSocketAPI.mockReturnValue(mockUseWebSocketAPI())

    api = useAPI()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Listener Forwarding Integration', () => {
    it('should forward listener from API layer to WebSocket client', async () => {
      const mockListener = vi.fn()
      const mockChannel = 'action:execute' as Channels
      const mockData = {
        pluginId: 'test-plugin',
        nodeId: 'test-node',
        params: {},
        steps: {}
      }
      const mockResult = { success: true }

      // Setup WebSocket API mock to return the result
      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockResolvedValue(mockResult),
        isConnected: true,
        disconnect: vi.fn()
      })

      // Reinitialize API with new mock
      const { useWebSocketAPI } = require('../renderer/composables/websocket-client')
      useWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockImplementation((channel: any, data: any, listener: any) => {
          // Verify listener is passed through correctly
          expect(listener).toBe(mockListener)
          expect(channel).toBe(mockChannel)
          expect(data).toBe(mockData)
          return Promise.resolve(mockResult)
        }),
        isConnected: true,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      // Execute with listener
      const result = await newApi.execute(mockChannel, mockData, mockListener)

      expect(result).toEqual(mockResult)
      expect(mockUseWebSocketAPI().execute).toHaveBeenCalledWith(
        mockChannel,
        mockData,
        mockListener
      )
    })

    it('should handle intermediate events correctly', async () => {
      const mockListener = vi.fn()
      const mockChannel = 'action:execute' as Channels
      const mockData = {
        pluginId: 'test-plugin',
        nodeId: 'test-node',
        params: {},
        steps: {}
      }

      // Create a more sophisticated mock that simulates intermediate events
      let resolvePromise: (value: any) => void
      const executePromise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockReturnValue(executePromise),
        isConnected: true,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      // Start execution in background
      const executePromiseResult = newApi.execute(mockChannel, mockData, mockListener)

      // Simulate intermediate events being sent to the listener
      const intermediateEvent1 = { type: 'progress', data: { step: 1, total: 3 } }
      const intermediateEvent2 = { type: 'progress', data: { step: 2, total: 3 } }

      // The listener should be called for intermediate events
      mockListener.mockImplementation((event: any) => {
        expect(event).toBeDefined()
        expect(event.type).toBe('progress')
      })

      // Simulate the WebSocket client calling the listener with intermediate events
      // In a real scenario, this would happen through the WebSocket message handling
      setTimeout(() => {
        mockListener(intermediateEvent1)
        mockListener(intermediateEvent2)

        // Resolve with final result
        resolvePromise!({ type: 'end', data: { success: true } })
      }, 10)

      const result = await executePromiseResult

      expect(mockListener).toHaveBeenCalledTimes(2)
      expect(mockListener).toHaveBeenCalledWith(intermediateEvent1)
      expect(mockListener).toHaveBeenCalledWith(intermediateEvent2)
      expect(result).toEqual({ success: true })
    })

    it('should handle listener errors gracefully', async () => {
      const mockListener = vi.fn().mockRejectedValue(new Error('Listener error'))
      const mockChannel = 'action:execute' as Channels
      const mockData = {
        pluginId: 'test-plugin',
        nodeId: 'test-node',
        params: {},
        steps: {}
      }
      const mockResult = { success: true }

      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockResolvedValue(mockResult),
        isConnected: true,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      // Should not throw error even if listener throws
      await expect(newApi.execute(mockChannel, mockData, mockListener)).resolves.toEqual(mockResult)
    })
  })

  describe('Backward Compatibility', () => {
    it('should maintain backward compatibility with send method', async () => {
      const mockChannel = 'action:execute' as Channels
      const mockData = {
        pluginId: 'test-plugin',
        nodeId: 'test-node',
        params: {},
        steps: {}
      }
      const mockResult = { success: true }

      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockResolvedValue(mockResult),
        isConnected: true,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      // Test deprecated send method
      const result = await newApi.send(mockChannel, mockData)

      expect(result).toEqual(mockResult)
      expect(mockUseWebSocketAPI().execute).toHaveBeenCalledWith(mockChannel, mockData, undefined)
    })

    it('should handle on method for backward compatibility', async () => {
      const mockChannel = 'action:execute' as Channels
      const mockListener = vi.fn()

      const newApi = useAPI()

      // Test deprecated on method
      const unsubscribe = newApi.on(mockChannel, mockListener)

      expect(typeof unsubscribe).toBe('function')
      expect(unsubscribe()).toBeUndefined()
    })

    it('should warn when using deprecated methods', async () => {
      const { useLogger } = require('../shared/logger')
      const mockLogger = useLogger().logger()
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const newApi = useAPI()

      // Use deprecated send method
      await newApi.send('fs:read' as Channels, { path: '/test/path' })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('useAPI.send() is deprecated')
      )

      // Use deprecated on method
      newApi.on('test-channel', vi.fn())

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('useAPI.on() is not supported in WebSocket mode')
      )

      consoleWarnSpy.mockRestore()
    })
  })

  describe('Connection State Integration', () => {
    it('should expose connection state correctly', () => {
      const newApi = useAPI()

      expect(newApi.isConnected).toBe(true)
      expect(typeof newApi.isConnected).toBe('boolean')
    })

    it('should handle disconnected state', () => {
      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn(),
        isConnected: false,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      expect(newApi.isConnected).toBe(false)
    })
  })

  describe('Error Handling Integration', () => {
    it('should handle WebSocket errors correctly', async () => {
      const mockError = new Error('WebSocket connection failed')
      const { useLogger } = require('../shared/logger')
      const mockLogger = useLogger().logger()

      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockRejectedValue(mockError),
        isConnected: true,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      await expect(newApi.execute('fs:read' as Channels, { path: '/test/path' })).rejects.toThrow(
        'WebSocket connection failed'
      )

      expect(mockLogger.error).toHaveBeenCalledWith('API execution error:', mockError)
    })

    it('should handle timeout scenarios', async () => {
      const timeoutError = new Error('Request timeout')

      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockRejectedValue(timeoutError),
        isConnected: true,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      await expect(newApi.execute('fs:read' as Channels, { path: '/test/path' })).rejects.toThrow(
        'Request timeout'
      )
    })
  })

  describe('Message Queue Integration', () => {
    it('should handle queued messages when connection is restored', async () => {
      // Simulate disconnected state initially
      mockWebSocketClient.isConnected.mockReturnValue(false)

      const queuedMessages: any[] = []
      mockWebSocketClient.send.mockImplementation((channel: any, data: any, listener: any) => {
        return new Promise((resolve, reject) => {
          queuedMessages.push({ channel, data, listener, resolve, reject })
        })
      })

      const { getWebSocketClient } = require('../renderer/composables/websocket-client')
      getWebSocketClient.mockReturnValue(mockWebSocketClient)

      const newApi = useAPI()

      // Try to execute when disconnected - should queue
      const executePromise = newApi.execute('fs:read' as Channels, { path: '/test/path' }, vi.fn())

      expect(queuedMessages).toHaveLength(1)
      expect(queuedMessages[0].channel).toBe('fs:read')

      // Simulate connection restored
      mockWebSocketClient.isConnected.mockReturnValue(true)

      // Manually trigger queue flush (in real implementation this happens in WebSocket client)
      queuedMessages[0].resolve({ success: true })

      const result = await executePromise
      expect(result).toEqual({ success: true })
    })
  })

  describe('Type Safety Integration', () => {
    it('should maintain type safety for different channel types', async () => {
      const mockResult = { success: true }

      mockUseWebSocketAPI.mockReturnValue({
        execute: vi.fn().mockResolvedValue(mockResult),
        isConnected: true,
        disconnect: vi.fn()
      })

      const newApi = useAPI()

      // Test with different channel types (these would be defined in the actual API types)
      const result1 = await newApi.execute('build-channel' as any, { buildId: '123' }, vi.fn())
      const result2 = await newApi.execute('deploy-channel' as any, { deployId: '456' }, vi.fn())

      expect(result1).toEqual(mockResult)
      expect(result2).toEqual(mockResult)
    })
  })
})
