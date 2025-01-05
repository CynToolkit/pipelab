import { app } from 'electron'

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default (json, ws, mainWindow) => {
  try {
    /** @type {Parameters<typeof app.getPath>[0] | 'app'} */
    const name = json.body.name;

    let folder;

    if (name === 'app') {
      folder = app.getAppPath();
    } else {
      folder = app.getPath(name);
    }

    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'output'>}
     */
    const userFolderResult = {
      url: json.url,
      correlationId: json.correlationId,
      body: {
        data: folder
      }
    };
    console.log('result', userFolderResult)
    ws.send(JSON.stringify(userFolderResult));
  } catch (e) {
    console.error('e', e)
    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'output'>}
     */
    const userFolderResult = {
      url: json.url,
      correlationId: json.correlationId,
      body: {
        error: e.message
      }
    };
    console.log('result', userFolderResult)
    ws.send(JSON.stringify(userFolderResult));
  }
}
