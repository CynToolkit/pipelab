/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetWidth, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const [, height] = mainWindow.getSize()
  mainWindow.setSize(json.body.value, height);

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetWidth, 'output'>}
   */
  const setWidthResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(setWidthResult));
}
