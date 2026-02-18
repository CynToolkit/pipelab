/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').DiscordSetActivity, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 * @param {import('discord-rpc').Client} rpc
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

  const startTimestampAsNumber = Number.parseInt(startTimestamp)

  try {
    await rpc.setActivity({
      details,
      state,
      startTimestamp: startTimestampAsNumber,
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
  } catch (e) {
    console.error('e', e)
    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').DiscordSetActivity, 'output'>}
     */
    const result = {
      url: json.url,
      correlationId: json.correlationId,
      body: {
        success: false,
        error: e.message
      }
    }
    ws.send(JSON.stringify(result))
  }
}
