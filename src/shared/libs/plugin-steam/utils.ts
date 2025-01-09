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
          options.context.log('data stdout', data)

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

  console.warn('error', error)

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
