// @ts-check

import { writeFile } from 'node:fs/promises'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageWriteFile, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
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
  console.log('result', writeFileResult)
  ws.send(JSON.stringify(writeFileResult))
}
