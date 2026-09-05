import { downloadFile, fileExists, runWithLiveLogs } from '../plugin-core'
import { chmod, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

const GPUPATCH_RELEASE = 'latest'

export const gpupatchAssetName = (platform: NodeJS.Platform, arch: NodeJS.Architecture): string => {
  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return 'gpupatch-cli-aarch64-apple-darwin'
    }
    if (arch === 'x64') {
      return 'gpupatch-cli-x86_64-apple-darwin'
    }
  } else if (platform === 'linux') {
    if (arch === 'x64') {
      return 'gpupatch-cli-x86_64-unknown-linux-gnu'
    }
  } else if (platform === 'win32') {
    if (arch === 'x64') {
      return 'gpupatch-cli-x86_64-pc-windows-msvc.exe'
    }
  }
  throw new Error(`gpupatch is not available for ${platform}-${arch}`)
}

export const ensureGpupatch = async (
  log: typeof console.log,
  abortSignal?: AbortSignal
): Promise<string> => {
  const { app } = await import('electron')
  const userData = app.getPath('userData')
  const gpupatchFolder = join(userData, 'thirdparty', 'gpupatch')
  const extension = process.platform === 'win32' ? '.exe' : ''
  const gpupatchPath = join(gpupatchFolder, `gpupatch-cli${extension}`)

  if (await fileExists(gpupatchPath)) {
    return gpupatchPath
  }

  const assetName = gpupatchAssetName(process.platform, process.arch)
  const url = `https://github.com/CynToolkit/gpupatch/releases/${GPUPATCH_RELEASE}/download/${assetName}`

  log('Downloading gpupatch from', url)

  await mkdir(gpupatchFolder, { recursive: true })

  await downloadFile(
    url,
    gpupatchPath,
    {
      onProgress: ({ progress }) => {
        log(`Downloading gpupatch: ${progress.toFixed(2)}%`)
      }
    },
    abortSignal
  )

  if (process.platform !== 'win32') {
    await chmod(gpupatchPath, 0o755)
  }

  return gpupatchPath
}

export const patchExecutableWithGpupatch = async (
  binaryPath: string,
  targetPlatform: NodeJS.Platform,
  { log, abortSignal }: { log: typeof console.log; abortSignal?: AbortSignal }
): Promise<void> => {
  if (targetPlatform !== 'win32') {
    log('gpupatch only supports Windows executables, skipping patch')
    return
  }

  const exePath = binaryPath.endsWith('.exe') ? binaryPath : `${binaryPath}.exe`

  log('Patching executable with gpupatch:', exePath)

  const gpupatchPath = await ensureGpupatch(log, abortSignal)

  const patchedPath = `${exePath}.gpupatch`

  await runWithLiveLogs(
    gpupatchPath,
    [exePath, patchedPath],
    {
      cancelSignal: abortSignal
    },
    log,
    {
      onStderr(data) {
        log(data)
      },
      onStdout(data) {
        log(data)
      }
    }
  )

  await rename(patchedPath, exePath)

  log('Patched executable with gpupatch')
}
