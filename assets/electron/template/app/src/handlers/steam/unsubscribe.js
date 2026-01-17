import { handleSteamRequest } from './utils.js'

/**
 * Core Steam workshop unsubscribe logic
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @returns {Promise<any>} The unsubscribe result
 */
const unsubscribeHandler = async (client, json) => {
  const { itemId } = json.body

  const itemIdBigInt = BigInt(itemId)

  const result = await client.workshop.unsubscribe(itemIdBigInt)

  return result
}

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, unsubscribeHandler)
}
