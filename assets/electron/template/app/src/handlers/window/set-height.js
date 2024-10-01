/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetHeight, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const [width] = mainWindow.getSize()
  mainWindow.setSize(width, json.body.value);

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetHeight, 'output'>}
   */
  const setHeightResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setHeightResult)
  ws.send(JSON.stringify(setHeightResult));
}
