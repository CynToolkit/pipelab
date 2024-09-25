/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowUnmaximize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.unmaximize();

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageWindowUnmaximize, 'output'>}
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
