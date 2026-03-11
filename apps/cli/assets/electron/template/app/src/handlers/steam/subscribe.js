import { handleSteamRequest } from './utils.js'

/**
 * Core Steam workshop subscribe logic
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @returns {Promise<any>} The subscribe result
 */
const subscribeHandler = async (client, json) => {
  const { itemId } = json.body

  const itemIdBigInt = BigInt(itemId)

  const result = await client.workshop.subscribe(itemIdBigInt)

  return result
}

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, subscribeHandler)
}
