/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowMinimize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.minimize();

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowMinimize, 'output'>}
   */
  const minimizeResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', minimizeResult)
  ws.send(JSON.stringify(minimizeResult));

}
