import { dialog } from 'electron'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowOpenDialog, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const openDialogResponse = await dialog.showOpenDialog({
    properties: ['openFile']
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowOpenDialog, 'output'>}
   */
  const dialogOpenResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      canceled: openDialogResponse.canceled,
      paths: openDialogResponse.filePaths
    }
  }
  console.log('result', dialogOpenResult)
  ws.send(JSON.stringify(dialogOpenResult));
}
