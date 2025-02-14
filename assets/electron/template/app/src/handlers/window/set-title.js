/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetTitle, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setTitle(json.body.value)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetTitle, 'output'>}
   */
  const setTitleResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(setTitleResult));
}
