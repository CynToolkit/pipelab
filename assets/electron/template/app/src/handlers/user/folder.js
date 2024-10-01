import { app } from 'electron'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default (json, ws, mainWindow) => {
  const userFolder = app.getPath(json.body.name);
  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'output'>}
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
