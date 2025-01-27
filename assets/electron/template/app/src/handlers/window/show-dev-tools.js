/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowDevTools, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  if (json.body.value === true) {
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.webContents.closeDevTools()
  }

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageShowDevTools, 'output'>}
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
