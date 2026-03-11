// @ts-check

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * @param {{url: string, correlationId?: string, body: {path: string, base64Data: string, flag?: string}}} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  const destDirName = dirname(json.body.path)
  await mkdir(destDirName, { recursive: true })

  // Decode base64 string to buffer
  const buffer = Buffer.from(json.body.base64Data, 'base64')

  await writeFile(json.body.path, buffer, {
    flag: json.body.flag
  })

  /**
   * @type {{url: string, correlationId?: string, body: {success: boolean}}}
   */
  const writeFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true
    }
  }
  ws.send(JSON.stringify(writeFileResult))
}
