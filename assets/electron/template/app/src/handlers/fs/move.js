// @ts-check

import { moveFile } from 'move-file';

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageMove, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  await moveFile(json.body.source, json.body.destination, {
    // overwrite: json.body.
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageMove, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
    }
  }
  console.log('result', readFileResult)
  ws.send(JSON.stringify(readFileResult))
}
