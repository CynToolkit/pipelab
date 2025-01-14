import { Options, Subprocess } from 'execa'
import { IPty, type IPtyForkOptions, type IWindowsPtyForkOptions } from '@lydell/node-pty'

export const runWithLiveLogs = async (
  command: string,
  args: string[],
  execaOptions: Options,
  log: typeof console.log,
  hooks?: {
    onStdout?: (data: string, subprocess: Subprocess) => void
    onStderr?: (data: string, subprocess: Subprocess) => void
    onExit?: (code: number) => void
  }
): Promise<void> => {
  const { execa } = await import('execa')
  return new Promise((resolve, reject) => {
    log('runWithLiveLogs', command, args, execaOptions)
    log('command: ', command, args.join(' '))

    const subprocess = execa(command, args, {
      ...execaOptions,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    })

    subprocess.stdout.on('data', (data: Buffer) => {
      log(data.toString())
      hooks?.onStdout?.(data.toString(), subprocess)
    })

    subprocess.stderr?.on('data', (data: Buffer) => {
      log(data.toString())
      hooks?.onStderr?.(data.toString(), subprocess)
    })

    subprocess.on('error', (error: Error) => {
      log('error', error)
      return reject(error)
    })

    subprocess.on('close', (code: number) => {
      log('close', code)
      hooks?.onExit?.(code)

      if (code === 0) {
        return resolve()
      } else {
        return reject(new Error(`Command exited with non-zero code: ${code}`))
      }
    })

    subprocess.on('disconnect', () => {
      log('disconnect')
      hooks?.onExit?.(0)
      return resolve()
    })

    subprocess.on('exit', (code: number) => {
      log('exit', code)
      hooks?.onExit?.(code)

      if (code === 0) {
        return resolve()
      } else {
        return reject(new Error(`Command exited with non-zero code: ${code}`))
      }
    })
  })
}

export const runWithLiveLogsPTY = async (
  command: string,
  args: string[],
  ptyOptions: IPtyForkOptions | IWindowsPtyForkOptions,
  log: typeof console.log,
  hooks?: {
    onStdout?: (data: string, subprocess: IPty) => void
    onStderr?: (data: string, subprocess: IPty) => void
    onExit?: (code: number) => void
  }
): Promise<void> => {
  const { spawn } = await import('@lydell/node-pty')
  return new Promise((resolve, reject) => {
    log('runWithLiveLogsPTY', command, args, ptyOptions)
    log('command: ', command, args.join(' '))

    const subprocess = spawn(command, args, ptyOptions)

    subprocess.onData((data) => {
      log(data.toString())
      hooks?.onStdout?.(data.toString(), subprocess)
    })

    subprocess.onExit(({ exitCode, signal }) => {
      log('exit', exitCode)
      hooks?.onExit?.(exitCode)

      if (exitCode === 0) {
        return resolve()
      } else {
        return reject(new Error(`Command exited with non-zero exitCode: ${exitCode}`))
      }
    })
  })
}
