// @ts-check

import { readFile } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageReadFileBinary, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const file = await readFile(json.body.path)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageReadFileBinary, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      content: [...file],
    }
  }
  console.log('result', readFileResult)
  ws.send(JSON.stringify(readFileResult))
}
