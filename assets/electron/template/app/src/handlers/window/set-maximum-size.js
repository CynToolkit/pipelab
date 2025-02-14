/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetMaximumSize, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setMaximumSize(json.body.width, json.body.height)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetMaximumSize, 'output'>}
   */
  const setMaximumSizeResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(setMaximumSizeResult));
}
