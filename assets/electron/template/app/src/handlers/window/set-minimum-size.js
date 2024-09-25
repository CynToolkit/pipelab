/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetMinimumSize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setMinimumSize(json.body.width, json.body.height)

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetMinimumSize, 'output'>}
   */
  const setMinimumSizeResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setMinimumSizeResult)
  ws.send(JSON.stringify(setMinimumSizeResult));
}
