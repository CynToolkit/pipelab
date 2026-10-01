import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { downloadFile, fileExists, runWithLiveLogs } from '../plugin-core'

const GPUPATCH_RELEASE = 'v0.2.1'

export const gpupatchAssetName = (platform: NodeJS.Platform, arch: NodeJS.Architecture): string => {
  if (platform === 'darwin' && arch === 'arm64') {
    return 'gpupatch-cli-aarch64-apple-darwin'
  }
  if (platform === 'darwin' && arch === 'x64') {
    return 'gpupatch-cli-x86_64-apple-darwin'
  }
  if (platform === 'linux' && arch === 'x64') {
    return 'gpupatch-cli-x86_64-unknown-linux-gnu'
  }
  if (platform === 'win32' && arch === 'x64') {
    return 'gpupatch-cli-x86_64-pc-windows-msvc.exe'
  }
  throw new Error(`gpupatch is not available for host ${platform}-${arch}`)
}

export const ensureGpupatch = async (
  log: typeof console.log,
  abortSignal?: AbortSignal
): Promise<string> => {
  abortSignal?.throwIfAborted()
  const assetName = gpupatchAssetName(process.platform, process.arch)
  const { app } = await import('electron')
  const cacheFolder = join(app.getPath('userData'), 'thirdparty', 'gpupatch', GPUPATCH_RELEASE)
  const executable = join(cacheFolder, assetName)

  if (await fileExists(executable)) {
    return executable
  }

  await mkdir(cacheFolder, { recursive: true })
  const temporaryFolder = await mkdtemp(join(cacheFolder, '.download-'))
  const temporaryFile = join(temporaryFolder, assetName)
  const url = `https://github.com/CynToolkit/gpupatch/releases/download/${GPUPATCH_RELEASE}/${assetName}`

  try {
    log('Downloading gpupatch from', url)
    await downloadFile(
      url,
      temporaryFile,
      {
        onProgress: ({ progress }) => log(`Downloading gpupatch: ${progress.toFixed(2)}%`)
      },
      abortSignal
    )
    abortSignal?.throwIfAborted()
    if (process.platform !== 'win32') {
      await chmod(temporaryFile, 0o755)
    }
    await rename(temporaryFile, executable)
    return executable
  } finally {
    await rm(temporaryFolder, { recursive: true, force: true })
  }
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

  abortSignal?.throwIfAborted()
  const gpupatch = await ensureGpupatch(log, abortSignal)
  const temporaryFolder = await mkdtemp(join(dirname(binaryPath), '.gpupatch-'))
  const patchedPath = join(temporaryFolder, basename(binaryPath))

  try {
    log('Patching executable with gpupatch:', binaryPath)
    await runWithLiveLogs(gpupatch, [binaryPath, patchedPath], { cancelSignal: abortSignal }, log, {
      onStderr: (data) => log(data),
      onStdout: (data) => log(data)
    })
    abortSignal?.throwIfAborted()
    await rename(patchedPath, binaryPath)
    log('Patched executable with gpupatch')
  } finally {
    await rm(temporaryFolder, { recursive: true, force: true })
  }
}
