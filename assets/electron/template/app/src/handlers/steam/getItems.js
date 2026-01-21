import { handleSteamRequest } from './utils.js'

/**
 * Core Steam workshop get items logic
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @returns {Promise<any>} The items result
 */
const getItemsHandler = async (client, json) => {
  const { itemIds } = json.body

  // Convert array of string itemIds to array of BigInts
  const itemIdsBigInt = itemIds.map((id) => BigInt(id))

  // TODO: Handle queryConfig parameter when needed
  const result = await client.workshop.getItems(itemIdsBigInt)

  return result
}

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, getItemsHandler)
}
