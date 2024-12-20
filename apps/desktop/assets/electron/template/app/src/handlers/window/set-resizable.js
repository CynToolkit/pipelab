/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetResizable, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setResizable(true)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetResizable, 'output'>}
   */
  const setResizableResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', setResizableResult)
  ws.send(JSON.stringify(setResizableResult));
}
