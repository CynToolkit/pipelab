/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetTitle, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setTitle(json.body.value)

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageSetTitle, 'output'>}
   */
  const setTitleResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setTitleResult)
  ws.send(JSON.stringify(setTitleResult));
}
