/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageEngine, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageEngine, 'output'>}
   */
  const engineResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      engine: 'electron'
    }
  }
  console.log('result', engineResult)
  ws.send(JSON.stringify(engineResult));
}
