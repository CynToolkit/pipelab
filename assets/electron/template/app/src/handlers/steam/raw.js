import { handleSteamRequest } from './utils.js'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@armaldio/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  console.log('json', json)

  await handleSteamRequest(
    client,
    json,
    ws,
    async (client, json) => {
      const { body } = json
      const { args, method, namespace } = body

      const result = await client[namespace][method](...args)

      // if (namespace === 'localplayer' && method === 'getSteamId') {
      //   console.log('result', result)
      //   // handle bigint to string
      //   /**
      //    * @type {{
      //     steamId64: bigint,
      //     steamId32: string,
      //     accountId: number
      //   }}
      //    */
      //   result = {
      //     steamId64: result.steamId64.toString(),
      //     steamId32: result.steamId32,
      //     accountId: result.accountId
      //   }
      // }

      return result
    },
    true
  )
}
