// @ts-check

import { readdir } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageListFiles, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const file = await readdir(json.body.path, {
    withFileTypes: true
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageListFiles, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      list: file.map((x) => ({
        type: x.isDirectory() ? 'folder' : 'file',
        name: x.name
      }))
    }
  }
  console.log('result', readFileResult)
  ws.send(JSON.stringify(readFileResult))
}
