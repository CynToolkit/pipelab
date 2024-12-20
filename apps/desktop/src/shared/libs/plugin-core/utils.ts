import { Options, Subprocess } from 'execa'

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
