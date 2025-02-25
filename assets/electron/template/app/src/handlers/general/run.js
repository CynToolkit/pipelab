import { execa } from 'execa';

/**
 * @param {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageRun, 'input'>} json
 * @param {import('ws').WebSocket} ws
 */
export default async (json, ws) => {
  const exec = execa({
    cwd: json.body.cwd,
    env: json.body.env,
  })
  const { stderr, stdout } = await exec(json.body.command, json.body.args)

  /**
   * @type {import('@pipelab/core').MakeInputOutput<import('@pipelab/core').MessageRun, 'output'>}
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
  ws.send(JSON.stringify(execResult));
}
