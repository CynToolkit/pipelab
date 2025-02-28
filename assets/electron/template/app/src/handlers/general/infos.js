import { arch, platform } from 'os'
/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageInfos, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  const myArch = arch()
  const myPlatform = platform()

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageInfos, 'output'>}
   */
  const engineResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      arch: myArch,
      platform: myPlatform,
      version: '0.0.0'
    }
  }
  ws.send(JSON.stringify(engineResult))
}
