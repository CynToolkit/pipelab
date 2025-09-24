/**
 * Checks if the Steam client is available and properly initialized
 * @param {Object} client - The Steam client instance to check
 * @returns {Object|null} Returns an error object if client is not available, null if available
 */
function checkSteamClient(client) {
  if (client === undefined || client === null) {
    return {
      success: false,
      error: 'Steam client is not initialized or available'
    }
  }

  return null
}

/**
 * Enhanced Steam request handler that combines client validation with response formatting
 * @param {import('@armaldio/steamworks.js').Client} client - The Steam client instance
 * @param {Object} json - The JSON request object containing url, correlationId, and body
 * @param {import('ws').WebSocket} ws - The WebSocket connection
 * @param {Function} handlerFunction - The handler function to execute if client is valid
 * @param {boolean} useRawErrorFormat - Whether to use raw error format (default: false)
 * @returns {Promise<void>} A promise that resolves when the request is handled
 */
function handleSteamRequest(client, json, ws, handlerFunction, useRawErrorFormat = false) {
  // Check if Steam client is initialized
  const clientError = checkSteamClient(client)
  if (clientError) {
    const errorResult = {
      url: json.url,
      correlationId: json.correlationId,
      body: useRawErrorFormat
        ? {
          data: null,
          success: false,
          error: clientError.error
        }
        : clientError
    }
    ws.send(JSON.stringify(errorResult))
    return Promise.resolve()
  }

  // Execute the handler function and format the response
  return Promise.resolve(handlerFunction(client, json))
    .then((result) => {
      const steamResult = {
        url: json.url,
        correlationId: json.correlationId,
        body: {
          data: result,
          success: true
        }
      }
      ws.send(JSON.stringify(steamResult, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
    })
    .catch((error) => {
      console.error('Error in Steam handler:', error)
      const errorResult = {
        url: json.url,
        correlationId: json.correlationId,
        body: useRawErrorFormat
          ? {
            data: null,
            success: false,
            error: error.message || 'Unknown error occurred'
          }
          : {
            success: false,
            error: error.message || 'Unknown error occurred'
          }
      }
      ws.send(JSON.stringify(errorResult))
    })
}

export { checkSteamClient, handleSteamRequest }
