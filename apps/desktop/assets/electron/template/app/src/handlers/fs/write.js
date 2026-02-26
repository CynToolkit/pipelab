// @ts-check

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageWriteFile, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  const destDirName = dirname(json.body.path)
  await mkdir(destDirName, { recursive: true })

  await writeFile(json.body.path, json.body.contents, {
    encoding: json.body.encoding,
    flag: json.body.flag
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageWriteFile, 'output'>}
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
