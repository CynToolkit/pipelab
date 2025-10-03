/**
 * Example demonstrating API-WebSocket integration with listener forwarding
 *
 * This example shows how the API layer forwards listeners to the WebSocket client
 * and how intermediate events are properly handled.
 */

import { useAPI } from '../renderer/composables/api'
import { Channels } from '../shared/apis'

// Example 1: Basic listener forwarding
export const exampleBasicListenerForwarding = async () => {
  const api = useAPI()

  // Define a listener for intermediate events
  const progressListener = async (event: any) => {
    console.log('Progress update:', event)
    if (event.type === 'progress') {
      console.log(`Step ${event.data.step}/${event.data.total}`)
    }
  }

  try {
    // Execute an action with a listener - the listener is forwarded to WebSocket client
    const result = await api.execute(
      'action:execute',
      {
        pluginId: 'example-plugin',
        nodeId: 'example-node',
        params: { input: 'test' },
        steps: {}
      },
      progressListener
    )

    console.log('Execution completed:', result)
  } catch (error) {
    console.error('Execution failed:', error)
  }
}

// Example 2: Multiple intermediate events
export const exampleMultipleIntermediateEvents = async () => {
  const api = useAPI()

  const events: any[] = []

  const listener = async (event: any) => {
    events.push(event)
    console.log('Received event:', event.type, event.data)
  }

  try {
    // This would typically be a long-running operation that sends multiple progress updates
    const result = await api.execute(
      'graph:execute',
      {
        graph: [],
        variables: [],
        projectName: 'Example Project'
      },
      listener
    )

    console.log(`Received ${events.length} intermediate events`)
    console.log('Final result:', result)
  } catch (error) {
    console.error('Graph execution failed:', error)
  }
}

// Example 3: Backward compatibility
export const exampleBackwardCompatibility = async () => {
  const api = useAPI()

  // Old API usage (deprecated but still works)
  try {
    const result1 = await api.send('fs:read', { path: '/example/file.txt' })
    console.log('File read result:', result1)

    // Set up a one-time listener (deprecated but still works)
    const unsubscribe = api.on('fs:write', (event, data) => {
      console.log('File written:', data)
    })

    // Clean up listener when done
    unsubscribe()
  } catch (error) {
    console.error('API call failed:', error)
  }
}

// Example 4: Connection state handling
export const exampleConnectionState = () => {
  const api = useAPI()

  console.log('API connected:', api.isConnected)

  // In a real application, you might want to:
  // - Disable UI elements when disconnected
  // - Show connection status to user
  // - Queue operations when disconnected
  // - Retry operations when reconnected

  return api.isConnected
}

// Example 5: Error handling with listeners
export const exampleErrorHandling = async () => {
  const api = useAPI()

  const errorListener = async (event: any) => {
    if (event.type === 'error') {
      console.error('Operation error:', event.data)
    }
  }

  try {
    await api.execute(
      'action:execute',
      {
        pluginId: 'faulty-plugin',
        nodeId: 'faulty-node',
        params: {},
        steps: {}
      },
      errorListener
    )
  } catch (error) {
    console.error('Caught error:', error)
    // Error handling logic here
  }
}

/**
 * Test scenarios that verify the integration:
 *
 * 1. Listener Forwarding: Verify that listeners pass from API → WebSocket client
 * 2. Intermediate Events: Verify progress events reach the listener correctly
 * 3. Error Handling: Verify errors are properly forwarded to listeners
 * 4. Backward Compatibility: Verify old API methods still work
 * 5. Connection State: Verify connection state is properly exposed
 * 6. Message Queueing: Verify operations queue when disconnected
 */

// Example usage in a Vue component
export const exampleVueComponentUsage = `
<script setup lang="ts">
import { useAPI } from '@/composables/api'

const api = useAPI()
const progressEvents = ref<any[]>([])
const isExecuting = ref(false)

const executeWithProgress = async () => {
  isExecuting.value = true
  progressEvents.value = []

  const listener = (event: any) => {
    progressEvents.value.push(event)
    if (event.type === 'progress') {
      console.log(\`Progress: \${event.data.step}/\${event.data.total}\`)
    }
  }

  try {
    const result = await api.execute('action:execute', {
      pluginId: 'my-plugin',
      nodeId: 'my-node',
      params: { input: 'test' },
      steps: {}
    }, listener)

    console.log('Success:', result)
  } catch (error) {
    console.error('Failed:', error)
  } finally {
    isExecuting.value = false
  }
}
</script>

<template>
  <div>
    <button @click="executeWithProgress" :disabled="!api.isConnected">
      Execute with Progress Tracking
    </button>

    <div v-if="isExecuting">
      <p>Executing...</p>
      <ul>
        <li v-for="event in progressEvents" :key="event.timestamp">
          {{ event.type }}: {{ event.data }}
        </li>
      </ul>
    </div>

    <p v-if="!api.isConnected" class="error">
      Disconnected - operations will be queued
    </p>
  </div>
</template>
`
