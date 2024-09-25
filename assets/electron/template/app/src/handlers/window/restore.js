/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowRestore, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.restore();

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowRestore, 'output'>}
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
