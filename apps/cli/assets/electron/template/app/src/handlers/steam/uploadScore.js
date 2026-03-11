import { handleSteamRequest } from './utils.js'

/**
 * Core Steam leaderboard upload logic
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @returns {Promise<any>} The upload result
 */
const uploadScoreHandler = async (client, json) => {
  const { body } = json
  const { name, score, type, metadata } = body

  const leaderboard = await client.leaderboards.findLeaderboard(name)

  const result = await client.leaderboards.uploadScore(leaderboard, score, type, metadata)

  return result
}

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, uploadScoreHandler)
}
