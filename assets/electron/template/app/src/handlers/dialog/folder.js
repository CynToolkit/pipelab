import { dialog } from 'electron'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowFolderDialog, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const openFolderDialogResponse = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowFolderDialog, 'output'>}
   */
  const dialogOpenResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      canceled: openFolderDialogResponse.canceled,
      paths: openFolderDialogResponse.filePaths
    }
  }
  console.log('result', dialogOpenResult)
  ws.send(JSON.stringify(dialogOpenResult));
}
