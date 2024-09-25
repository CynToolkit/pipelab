/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetWidth, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const [, height] = mainWindow.getSize()
  mainWindow.setSize(json.body.value, height);

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetWidth, 'output'>}
   */
  const setWidthResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setWidthResult)
  ws.send(JSON.stringify(setWidthResult));
}
