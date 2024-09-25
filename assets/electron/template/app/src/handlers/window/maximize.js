/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowMaximize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.maximize();

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowMaximize, 'output'>}
   */
  const maximizeResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', maximizeResult)
  ws.send(JSON.stringify(maximizeResult));
}
