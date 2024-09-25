import { shell } from 'electron'

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageOpen, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
*/
export default async (json, ws, mainWindow) => {
  await shell.openPath(json.body.path)

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageOpen, 'output'>}
   */
  const runResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
    }
  }
  console.log('result', runResult)
  ws.send(JSON.stringify(runResult));
}
