// @ts-check

import { writeFile } from 'node:fs/promises'

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWriteFile, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  await writeFile(json.body.path, json.body.contents, {
    encoding: json.body.encoding
  })

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWriteFile, 'output'>}
   */
  const writeFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', writeFileResult)
  ws.send(JSON.stringify(writeFileResult))
}
