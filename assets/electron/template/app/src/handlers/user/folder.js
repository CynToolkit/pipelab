import { app } from 'electron'

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessagePaths, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default (json, ws, mainWindow) => {
  const userFolder = app.getPath(json.body.name);
  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessagePaths, 'output'>}
   */
  const userFolderResult = {
    url: json.url,
    correlationId: json.correlationId,
    body: {
      data: userFolder
    }
  };
  console.log('result', userFolderResult)
  ws.send(JSON.stringify(userFolderResult));
}
