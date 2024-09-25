/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetMaximumSize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setMaximumSize(json.body.width, json.body.height)

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetMaximumSize, 'output'>}
   */
  const setMaximumSizeResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setMaximumSizeResult)
  ws.send(JSON.stringify(setMaximumSizeResult));
}
