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
      options.context.abortSignal
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
  keepOpen = false
) => {
  const { execa } = await import('execa')
  const os = await import('os')

  const platform = process.platform

  if (platform === 'darwin') {
    // macOS: open in Terminal.app
    const shellCommand = `${command} ${args.join(' ')}`;
    // Escape for AppleScript string literal
    const escapedShellCommand = shellCommand
      .replace(/\\/g, '\\\\') // Must escape backslashes first
      .replace(/"/g, '\\"'); // Then escape double quotes

    let osaScript: string;
    if (keepOpen) {
      // If keepOpen is true, just run the command and leave the terminal open.
      // Added activate to bring Terminal to front.
      osaScript = `tell application "Terminal"\nactivate\ndo script "${escapedShellCommand}"\nend tell`;
    } else {
      // If keepOpen is false (default), run the command, wait for it to finish, then close the tab.
      osaScript = `tell application "Terminal"
    activate
    set targetTab to do script "${escapedShellCommand}"
    -- Wait for the command to complete by checking the 'busy' status of the tab
    delay 0.5 -- Initial delay to allow the process to start and tab to become busy
    repeat while busy of targetTab
        delay 0.5 -- Check every 0.5 seconds
    end repeat
    -- Command has finished, now close the tab
    close targetTab
end tell`;
    }

    return execa('osascript', ['-e', osaScript], options);
  } else if (platform === 'linux') {
    // Linux: use $TERMINAL, $TERM, or fallback to xterm
    const terminal = process.env.TERMINAL ?? process.env.TERM ?? 'xterm'
    return execa(terminal, ['-e', command, ...args], options)
  } else if (platform === 'win32') {
    // Windows: try PowerShell by default, fallback to CMD if needed
    // try {
    //   console.log('verifying')
    //   // Try a harmless PowerShell command. We ignore stdio.
    //   await execa(
    //     'powershell.exe',
    //     ['-Command', 'Write-Output "PowerShell available"; exit'],
    //     {
    //       all: true
    //     }
    //   )
    //   return execa(
    //     'cmd.exe',
    //     [keepOpen ? '/k' : '/c', 'start', 'powershell.exe', '-Command', command, ...args],
    //     options
    //   )
    // } catch (error) {
    // Oops! No PowerShell? Fallback to CMD.
    return execa(
      'cmd.exe',
      [keepOpen ? '/k' : '/c', 'start', 'cmd.exe', '/c', command, ...args],
      options
    )
    // }
  } else {
    throw new Error('Unsupported platform: ' + platform)
  }
}
