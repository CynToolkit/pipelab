/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageRequestAttention, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  mainWindow.flashFrame(true);

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageRequestAttention, 'output'>}
   */
  const requestAttentionResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  console.log('result', requestAttentionResult)
  ws.send(JSON.stringify(requestAttentionResult));
}
