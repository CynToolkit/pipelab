/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExit, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {(exitCode?: number) => Promise<void>} requestQuit
 */
export default async (json, ws, requestQuit) => {
  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExit, 'output'>}
   */
  const engineResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(engineResult))

  await requestQuit(json.body.code)
}
