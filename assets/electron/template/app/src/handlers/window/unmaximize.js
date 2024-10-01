/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageWindowUnmaximize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.unmaximize();

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageWindowUnmaximize, 'output'>}
   */
  const unmaximizeResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', unmaximizeResult)
  ws.send(JSON.stringify(unmaximizeResult));

}
