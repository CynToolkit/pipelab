/**
 * @param {Object} json
 * @param {string} json.correlationId
 * @param {string} json.url
 * @param {{ ignore: boolean, forward?: boolean }} json.body
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const { ignore, forward } = json.body;

  mainWindow.setIgnoreMouseEvents(ignore, { forward });

  const result = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
    },
  };
  ws.send(JSON.stringify(result));
};
