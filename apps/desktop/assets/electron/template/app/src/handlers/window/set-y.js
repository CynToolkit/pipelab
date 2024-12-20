/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetY, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const [x, y] = mainWindow.getPosition()
  mainWindow.setPosition(x, json.body.value);

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetY, 'output'>}
   */
  const setYResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setYResult)
  ws.send(JSON.stringify(setYResult));
}
