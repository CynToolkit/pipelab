import { app } from 'electron'
/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExit, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
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

  app.exit(json.body.code)
}
