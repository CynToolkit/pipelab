# Pipelab SDK Integration (soon)

## Overview
The Pipelab SDK provides powerful tools for integrating with applications. This section covers how to set up and use the SDK in your applications. For detailed API reference, see the [official Pipelab SDK documentation](https://sdk.pipelab.app).

## SDK Versioning
The Pipelab SDK follows semantic versioning. We recommend using a specific version range in your package.json to ensure compatibility:

```json
"dependencies": {
  "@pipelab/core": "^1.2.0"
}
```

## Setup Instructions
1. Install the Pipelab SDK package:
    ```bash
    npm install @pipelab/core
    ```

2. Import the SDK in your Electron main process:
    ```javascript
    const { PipelabSDK } = require('@pipelab/core');
    ```

3. Initialize the SDK in your main process:
    ```javascript
    const sdk = new PipelabSDK();
    ```

## Using Pipelab SDK
The SDK is intended to run in a browser environment because it commmunicate with a WebSocket server running in the main process.

### Basic Usage Example
```javascript
// TODO
```

### SDK Compatibility
The Pipelab SDK works with any wrapper that supports Node.js or has a JavaScript runtime:
- Tauri (with Node.js integration)
- NW.js
- Neutralino.js

More languages will be supported in the future.

# Raw API

If you need to use the raw API, you can use the following code:

```ts
// Create WebSocket connection
const ws = new WebSocket('ws://localhost:31753');

ws.onopen = () => {
    console.log('Connected to WebSocket server');
    
    // Send achievement activation request
    ws.send(JSON.stringify({
        url: '/steam/raw',
        body: {
            namespace: 'achievements',  // Steamworks namespace
            method: 'activate',        // Method to call
            args: ['YOUR_ACHIEVEMENT_ID']  // Achievement ID as an array
        }
    }));
};

// Handle incoming messages
ws.onmessage = (event) => {
    const response = JSON.parse(event.data);
    console.log('Server response:', response);
};

// Error handling
ws.onerror = (error) => console.error('WebSocket error:', error);
ws.onclose = () => console.log('Connection closed');
```

You can find the format of the orders to send in this [messages](https://github.com/CynToolkit/core/blob/main/src/messages.ts) file.