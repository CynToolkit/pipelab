// @ts-check

import { readFile } from 'node:fs/promises'

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageReadFile, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const file = await readFile(json.body.path, {
    encoding: json.body.encoding
  })

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageReadFile, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      content: file,
    }
  }
  console.log('result', readFileResult)
  ws.send(JSON.stringify(readFileResult))
}
