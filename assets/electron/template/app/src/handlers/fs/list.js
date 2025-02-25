// @ts-check

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import slash from 'slash'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageListFiles, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  const file = await readdir(json.body.path, {
    withFileTypes: true,
    recursive: json.body.recursive
  })

  console.log('file', file)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageListFiles, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      list: file.map((x) => ({
        type: x.isDirectory() ? 'folder' : 'file',
        name: x.name,
        parent: slash(x.parentPath),
        path: slash(join(x.parentPath, x.name))
      }))
    }
  }
  ws.send(JSON.stringify(readFileResult))
}
