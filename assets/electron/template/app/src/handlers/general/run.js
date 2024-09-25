import { execa } from 'execa';

/**
 * @param {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageRun, 'input'>} json
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
  const exec = execa({
    cwd: json.body.cwd,
    env: json.body.env,
  })
  const { stderr, stdout } = await exec(json.body.command, json.body.args)

  /**
   * @type {import('@cyn/core').MakeInputOutput<import('@cyn/core').MessageRun, 'output'>}
   */
  const execResult = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
      success: true,
      stdout,
      stderr,
    }
  }
  console.log('result', execResult)
  ws.send(JSON.stringify(execResult));
}
