// @ts-check

import { app } from 'electron'
import { join } from 'path'

import slash from 'slash';
import { getAppName } from '../../utils.js';

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {AppConfig.Config} config
 */
export default (json, ws, config) => {
  try {
    const name = json.body.name

    let folder

    const { env } = process
    //      windows       linux
    const { LOCALAPPDATA, XDG_DATA_HOME } = env
    const appData = app.getPath('appData')
    const localAppData = LOCALAPPDATA ?? XDG_DATA_HOME ?? appData

    const appNameFolder = getAppName(config)

    const localUserData = join(localAppData, appNameFolder)

    if (name === 'app') {
      folder = app.getAppPath()
    } else if (name === 'project') {
      folder = join(app.getAppPath(), 'src', 'app') // path to construct files
    } else if (name === 'localAppData') {
      folder = localAppData
    } else if (name === 'localUserData') {
      folder = localUserData
    } else {
      folder = app.getPath(name)
    }

    /**
     * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'output'>}
     */
    const userFolderResult = {
      url: json.url,
      correlationId: json.correlationId,
      body: {
        data: slash(folder)
      }
    }
    console.log('result', userFolderResult)
    ws.send(JSON.stringify(userFolderResult))
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
    }
    console.log('result', userFolderResult)
    ws.send(JSON.stringify(userFolderResult))
  }
}
