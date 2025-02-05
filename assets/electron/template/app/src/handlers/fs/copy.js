// @ts-check

import { cp } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageCopyFile, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  await cp(json.body.source, json.body.destination, {
    force: json.body.overwrite
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageCopyFile, 'output'>}
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
