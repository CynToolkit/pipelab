// @ts-check

import { stat } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageFileSize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  const stats = await stat(json.body.path)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageFileSize, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      size: stats.size,
    }
  }
  ws.send(JSON.stringify(readFileResult))
}
