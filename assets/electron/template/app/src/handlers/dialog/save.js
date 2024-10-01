import { dialog } from 'electron'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowSaveDialog, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const saveDialogResponse = await dialog.showSaveDialog({
    properties: []
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowSaveDialog, 'output'>}
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
