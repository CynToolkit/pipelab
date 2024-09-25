// @ts-check

import { mkdir } from 'node:fs/promises'

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageCreateFolder, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  await mkdir(json.body.path, {
    recursive: json.body.recursive,
  })

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageCreateFolder, 'output'>}
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
