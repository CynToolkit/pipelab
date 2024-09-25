/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageShowDevTools, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.webContents.openDevTools()

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageShowDevTools, 'output'>}
   */
  const showDevtoolsResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', showDevtoolsResult)
  ws.send(JSON.stringify(showDevtoolsResult));
}
