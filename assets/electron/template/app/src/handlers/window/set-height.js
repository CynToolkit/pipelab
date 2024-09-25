/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetHeight, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const [width] = mainWindow.getSize()
  mainWindow.setSize(width, json.body.value);

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetHeight, 'output'>}
   */
  const setHeightResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setHeightResult)
  ws.send(JSON.stringify(setHeightResult));
}
