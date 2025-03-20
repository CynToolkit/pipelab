/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').DiscordSetActivity, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 * @param {Object} client
 */
export default async (json, ws, mainWindow, rpc) => {
  console.log('json', json)

  const { body } = json
  const {
    details,
    largeImageKey,
    largeImageText,
    smallImageKey,
    smallImageText,
    startTimestamp,
    state
  } = body

  if (!rpc || !mainWindow) {
    return
  }

  rpc.setActivity({
    details,
    state,
    startTimestamp,
    largeImageKey,
    largeImageText,
    smallImageKey,
    smallImageText,
    instance: false
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').DiscordSetActivity, 'output'>}
   */
  const result = {
    url: json.url,
    correlationId: json.correlationId,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(result))
}
