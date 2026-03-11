// @ts-check

import { access } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExistFile, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  try {
    await access(json.body.path)

    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExistFile, 'output'>}
     */
    const existResult = {
      correlationId: json.correlationId,
      url: json.url,
      body: {
        success: true
      }
    }
    ws.send(JSON.stringify(existResult))
  } catch (e) {
    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExistFile, 'output'>}
     */
    const existResult = {
      correlationId: json.correlationId,
      url: json.url,
      body: {
        success: false
      }
    }
    ws.send(JSON.stringify(existResult))
  }
}
