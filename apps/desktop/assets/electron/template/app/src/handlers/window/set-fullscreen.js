/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetFullscreen, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  if (json.body.value === 'fullscreen') {
    mainWindow.setFullScreen(true)
  } else if (json.body.value === 'normal') {
    mainWindow.setFullScreen(false)
  } else {
    throw new Error('Unsupported value ')
  }

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageSetFullscreen, 'output'>}
   */
  const showsetFullscreenResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(showsetFullscreenResult));
}
