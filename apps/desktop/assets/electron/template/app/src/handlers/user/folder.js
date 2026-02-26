// @ts-check

import { app } from 'electron'
import { join } from 'path'

import slash from 'slash';
import { getAppName } from '../../utils.js';

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessagePaths, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {ElectronAppConfig.Config} config
 */
export default (json, ws, config) => {
  try {
    const name = json.body.name

    let folder

    const { env } = process
    //      windows       linux
    const { APPDATA, LOCALAPPDATA, XDG_DATA_HOME, XDG_CONFIG_HOME } = env
    const appDataBackup = app.getPath('appData')
    const localAppData = LOCALAPPDATA ?? XDG_DATA_HOME ?? appDataBackup
    const appData = APPDATA ?? XDG_CONFIG_HOME ?? appDataBackup

    const appNameFolder = getAppName(config)

    const localUserData = join(localAppData, appNameFolder)
    const userData = join(appData, appNameFolder)

    if (name === 'app') {
      folder = app.getAppPath()
    } else if (name === 'project') {
      folder = join(app.getAppPath(), 'src', 'app') // path to construct files
    } else if (name === 'localAppData') {
      folder = localAppData
    } else if (name === 'localUserData') {
      folder = localUserData
    } else if (name === 'userData') {
      folder = userData
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
    ws.send(JSON.stringify(userFolderResult))
  }
}
