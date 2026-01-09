import { handleSteamRequest } from './utils.js'

// * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').SteamRaw, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('@pipelab/steamworks.js').Client} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, async (client, json) => {
    const { body } = json
    const { name, type, start, end } = body

    const leaderboard = await client.leaderboards.findLeaderboard(name)
    /** @type {Awaited<ReturnType<leaderboards['downloadScores']>>} */
    const result = await client.leaderboards.downloadScores(leaderboard, type, start, end)

    // Enhance each result with the Steam friend name
    const enhancedResult = await Promise.all(
      result.map(async (entry) => ({
        ...entry,
        name: await client.friends.getFriendName(entry.steamId)
      }))
    )

    return enhancedResult
  })
}
