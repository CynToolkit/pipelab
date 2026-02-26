// @ts-check

import { unlink } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageDelete, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  await unlink(json.body.path)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageDelete, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
    }
  }
  ws.send(JSON.stringify(readFileResult))
}
