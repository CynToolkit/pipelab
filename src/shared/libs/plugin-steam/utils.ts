import { runWithLiveLogsPTY } from '../plugin-core'
import { Options as ExecaOptions } from 'execa'

export type Options = {
  steamcmdPath: string
  username: string
  scriptPath: string
  context: {
    log: typeof console.log
    abortSignal: AbortSignal
  }
}

export const checkSteamAuth = async (options: Options) => {
  let error: 'LOGGED_OUT' | 'UNKNOWN' | undefined = undefined

  try {
    await runWithLiveLogsPTY(
      options.steamcmdPath,
      ['+login', options.username, '+quit'],
      {},
      options.context.log,
      {
        onStdout: (data, subprocess) => {
          options.context.log('[Steam Cmd]', data)
          // TODO: handle password input dynamically
          if (data.includes('Cached credentials not found')) {
            error = 'LOGGED_OUT'

            subprocess.kill()
          }
        }
      },
      options.context.abortSignal,
    )
  } catch (e) {
    console.error('e', e)
    if (!error) {
      error = 'UNKNOWN'
    }
  }

  if (error) {
    return {
      success: false,
      error
    }
  }

  return {
    success: true
  }
}

export const openExternalTerminal = async (
  command: string,
  args: string[] = [],
  options: ExecaOptions = {},
) => {
  const { execa } = await import('execa')
  const os = await import('os')

  const platform = os.platform()

  try {
    if (platform === 'darwin') {
      // macOS
      await execa('open', ['-a', 'Terminal', command, ...args], options)
    } else if (platform === 'linux') {
      // Linux
      const terminal = process.env.TERMINAL ?? process.env.TERM ?? 'xterm'
      await execa(terminal, ['-e', command, ...args], options)
    } else if (platform === 'win32') {
      // Windows
      await execa('cmd.exe', ['/c', 'start', 'cmd.exe', '/c', command, ...args], options)
    } else {
      throw new Error('Unsupported platform:' + platform)
    }
  } catch (error) {
    throw new Error('Error opening terminal:' + error.message)
  }
}
