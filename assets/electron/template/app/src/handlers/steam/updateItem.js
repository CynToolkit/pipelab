import { handleSteamRequest } from './utils.js'

/**
 * Core Steam workshop update item logic
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @returns {Promise<any>} The update result
 */
const updateItemHandler = async (client, json) => {
  // Extract arguments: [itemId, updateDetails, appID]
  const [itemId, updateDetails, appID] = json.body.args
  
  // Convert itemId from string to BigInt
  const itemIdBigInt = BigInt(itemId)
  
  // Call the workshop updateItem method with converted itemId
  const result = await client.workshop.updateItem(
    itemIdBigInt,
    updateDetails,
    appID
  )
  
  return result
}

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, updateItemHandler)
}
