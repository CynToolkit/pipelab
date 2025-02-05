// @ts-check

import { mkdir } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageCreateFolder, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  await mkdir(json.body.path, {
    recursive: json.body.recursive,
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageCreateFolder, 'output'>}
   */
  const folderCreateResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', folderCreateResult)
  ws.send(JSON.stringify(folderCreateResult))
}
