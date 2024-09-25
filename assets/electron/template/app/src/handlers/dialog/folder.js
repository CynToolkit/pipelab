import { dialog } from 'electron'

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageShowFolderDialog, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const openFolderDialogResponse = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageShowFolderDialog, 'output'>}
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
