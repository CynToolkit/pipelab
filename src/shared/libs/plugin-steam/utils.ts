import { runWithLiveLogsPTY } from '../plugin-core'
import { Options as ExecaOptions } from 'execa'
import { tmpdir } from 'os'
import { join } from 'path'
import { access, unlink } from 'fs/promises'

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
    const markerFile = `steam_upload_marker_${Date.now()}`
    const markerFilePath = join(tmpdir(), markerFile)

    // Escape command and arguments for AppleScript and shell
    // First, join command and args into a single shell command string
    const shellCommandParts = [command, ...args.map(arg => `'${arg.replace(/'/g, "'\\''")}'`)];
    const fullShellCommand = shellCommandParts.join(' ')

    // Construct the AppleScript command
    // This will execute the command, then touch the marker file, then exit.
    const appleScriptCommand = `tell app "Terminal" to do script "${fullShellCommand.replace(/"/g, '\\"')} ; touch '${markerFilePath.replace(/'/g, "'\\''")}' ; exit"`

    try {
      // Execute the AppleScript
      // We don't await this directly if we want to poll, but the original execa call was returned.
      // For now, let's keep it simple and see if `execa` waits for `osascript` which in turn might wait for the script if not for 'do script'.
      // The requirement is to wait for the command in Terminal to complete, so polling is necessary.
      await execa('osascript', ['-e', appleScriptCommand], options)

      // Polling loop
      const POLLING_INTERVAL_MS = 500
      const POLLING_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
      const startTime = Date.now()

      while (true) {
        if (options.signal?.aborted) {
          const abortError = options.signal.reason ?? new Error('Operation aborted by signal')
          throw abortError
        }

        if (Date.now() - startTime > POLLING_TIMEOUT_MS) {
          throw new Error(`Operation timed out after ${POLLING_TIMEOUT_MS / 1000 / 60} minutes waiting for command to complete in terminal.`)
        }

        try {
          await access(markerFilePath)
          // File exists, break loop
          break
        } catch (error) {
          // File does not exist yet, wait and retry
          // Ensure the wait itself can be interrupted by an abort signal if the promise setup allows for it,
          // though a short timeout like 500ms makes this less critical.
          // For simplicity, we're not making the setTimeout itself abortable here,
          // relying on the check at the start of the next iteration.
          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS))
        }
      }
    } finally {
      // Cleanup: attempt to delete the marker file if it exists
      try {
        await unlink(markerFilePath)
      } catch (error) {
        // Ignore errors during cleanup (e.g., file already deleted or never created)
      }
    }
    // If we reach here, the command completed and marker was handled.
    // The original function returned the execa promise, what should we return now?
    // We should probably return void or some status. For now, let's adapt to return the execa result of osascript.
    // However, the execa for osascript will return much earlier.
    // The function should effectively 'block' until the marker is found.
    // Let's return nothing for now, or a success object.
    return // This will be implicitly Promise<void>
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
