/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetAlwaysOnTop, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setAlwaysOnTop(true);

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetAlwaysOnTop, 'output'>}
   */
  const setAlwaysOnTopResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setAlwaysOnTopResult)
  ws.send(JSON.stringify(setAlwaysOnTopResult));
}
