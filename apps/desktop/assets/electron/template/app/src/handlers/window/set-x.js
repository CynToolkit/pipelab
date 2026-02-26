/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetX, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const [x, y] = mainWindow.getPosition()
  mainWindow.setPosition(json.body.value, y);

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetX, 'output'>}
   */
  const setXResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(setXResult));
}
