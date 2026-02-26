/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetAlwaysOnTop, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.setAlwaysOnTop(true);

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetAlwaysOnTop, 'output'>}
   */
  const setAlwaysOnTopResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(setAlwaysOnTopResult));
}
