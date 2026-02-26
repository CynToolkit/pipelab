import { handleSteamRequest } from './utils.js'

/**
 * Core Steam workshop install info logic
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @returns {Promise<any>} The install info result
 */
const installInfoHandler = async (client, json) => {
  const { itemId } = json.body

  const itemIdBigInt = BigInt(itemId)

  const result = client.workshop.installInfo(itemIdBigInt)

  return result
}

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, installInfoHandler)
}
