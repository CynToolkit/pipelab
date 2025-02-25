/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageEngine, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageEngine, 'output'>}
   */
  const engineResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      engine: 'electron'
    }
  }
  ws.send(JSON.stringify(engineResult));
}
