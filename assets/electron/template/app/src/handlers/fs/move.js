// @ts-check

import { moveFile } from 'move-file';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageMove, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  const destDirName = dirname(json.body.destination)
  await mkdir(destDirName, { recursive: true })

  await moveFile(json.body.source, json.body.destination, {
    overwrite: json.body.overwrite
  })

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageMove, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
    }
  }
  ws.send(JSON.stringify(readFileResult))
}
