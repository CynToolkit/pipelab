// @ts-check

import { readFile } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageReadFile, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  try {
    const file = await readFile(json.body.path, {
      encoding: json.body.encoding
    })

    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageReadFile, 'output'>}
     */
    const readFileResult = {
      correlationId: json.correlationId,
      url: json.url,
      body: {
        success: true,
        content: file,
      }
    }
    ws.send(JSON.stringify(readFileResult))
  } catch (e) {
    console.error('e', e)
    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageReadFile, 'output'>}
     */
    const readFileResult = {
      correlationId: json.correlationId,
      url: json.url,
      body: {
        success: false,
        error: e.message,
      }
    }
    ws.send(JSON.stringify(readFileResult))
  }
}
