import { handleSteamRequest } from './utils.js'

/**
 * Core Steam workshop get item logic
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @returns {Promise<any>} The item result
 */
const getItemHandler = async (client, json) => {
  const { itemId } = json.body

  // Convert itemId from string to BigInt
  const itemIdBigInt = BigInt(itemId)

  // TODO: Handle queryConfig parameter when needed
  const result = await client.workshop.getItem(itemIdBigInt)

  return result
}

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, getItemHandler)
}
