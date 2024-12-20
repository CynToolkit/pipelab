/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('steamworks.js').Client} client
 */
export default async (json, ws, client) => {
  console.log('json', json)

  const { body } = json
  const { args, method, namespace } = body

  const result = await client[namespace][method](...args)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'output'>}
   */
  const steamResult = {
    url: json.url,
    correlationId: json.correlationId,
    body: {
      data: result,
      success: true
    }
  };
  console.log('result', steamResult)
  ws.send(JSON.stringify(steamResult));
}
