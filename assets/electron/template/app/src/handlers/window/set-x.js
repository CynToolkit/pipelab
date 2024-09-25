/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetX, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const [x, y] = mainWindow.getPosition()
  mainWindow.setPosition(json.body.value, y);

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetX, 'output'>}
   */
  const setXResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setXResult)
  ws.send(JSON.stringify(setXResult));
}
