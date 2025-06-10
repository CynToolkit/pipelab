// @ts-check

import { readdir } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import slash from 'slash'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageListFiles, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  // Custom recursive directory listing for Node 18 compatibility
  async function listDirRecursive(dir, parentPath) {
    let results = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullpath = join(dir, entry.name);
      const type = entry.isDirectory() ? 'directory' : 'file';
      const relPath = slash(relative(json.body.path, fullpath));
      results.push({
        type,
        name: entry.name,
        parent: slash(parentPath),
        path: relPath
      });
      if (entry.isDirectory()) {
        const subResults = await listDirRecursive(fullpath, fullpath);
        results = results.concat(subResults);
      }
    }
    return results;
  }

  let fileList = [];
  try {
    fileList = await listDirRecursive(json.body.path, dirname(json.body.path));
  } catch (err) {
    console.error('Error listing files:', err);
    ws.send(JSON.stringify({
      correlationId: json.correlationId,
      url: json.url,
      body: { success: false, error: err.message }
    }));
    return;
  }

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageListFiles, 'output'>}
   */
  const readFileResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      list: fileList
    }
  };
  ws.send(JSON.stringify(readFileResult));
}
