/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageWindowRestore, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.restore();

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageWindowRestore, 'output'>}
   */
  const restoreResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', restoreResult)
  ws.send(JSON.stringify(restoreResult));
}
