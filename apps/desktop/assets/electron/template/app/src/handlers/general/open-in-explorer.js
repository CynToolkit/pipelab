import { shell } from 'electron'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExplorerOpen, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
*/
export default async (json, ws, mainWindow) => {
  await shell.showItemInFolder(json.body.path)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageExplorerOpen, 'output'>}
   */
  const runResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
    }
  }
  console.log('result', runResult)
  ws.send(JSON.stringify(runResult));
}
