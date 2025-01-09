import { runWithLiveLogs } from '../plugin-core'

export type Options = {
  steamcmdPath: string
  username: string
  scriptPath: string
  context: {
    log: typeof console.log
  }
}

export const checkSteamAuth = async (options: Options) => {
  let error: 'LOGGED_OUT' | 'UNKNOWN' | undefined = undefined

  try {
    await runWithLiveLogs(
      options.steamcmdPath,
      ['+login', options.username, '+quit'],
      {},
      options.context.log,
      {
        onStdout: (data, subprocess) => {
          // TODO: handle password input dynamically
          if (data.includes('Cached credentials not found')) {
            error = 'LOGGED_OUT'

            subprocess.kill()
          }
        }
      }
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

export const openExternalTerminal = async (command: string, args: string[] = [], options = {}) => {
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
      await execa('cmd', ['/c', command, ...args], options)
    } else {
      throw new Error('Unsupported platform:' + platform)
    }
  } catch (error) {
    throw new Error('Error opening terminal:' + error.message)
  }
}