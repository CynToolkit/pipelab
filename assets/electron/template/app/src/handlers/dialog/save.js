import { dialog } from 'electron'

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageShowSaveDialog, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const saveDialogResponse = await dialog.showSaveDialog({
    properties: []
  })

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageShowSaveDialog, 'output'>}
   */
  const dialogOpenResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      path: saveDialogResponse.filePath
    }
  }
  console.log('result', dialogOpenResult)
  ws.send(JSON.stringify(dialogOpenResult));
}
