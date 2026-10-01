import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadFile, runWithLiveLogs } from '../plugin-core'
import { ensureGpupatch, gpupatchAssetName, patchExecutableWithGpupatch } from './gpupatch'

const cache = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => cache.root } }))
vi.mock('../plugin-core', () => ({
  downloadFile: vi.fn(),
  runWithLiveLogs: vi.fn(),
  fileExists: async (path: string) =>
    access(path).then(
      () => true,
      () => false
    )
}))

const log = vi.fn()
let binary: string

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('process', { ...process, platform: 'linux', arch: 'x64' })
  cache.root = await mkdtemp(join(tmpdir(), 'pipelab-gpupatch-'))
  binary = join(cache.root, 'My Game.exe')
  await writeFile(binary, 'original')
  vi.mocked(downloadFile).mockImplementation(async (_url, path) => {
    await writeFile(path, 'cli')
  })
  vi.mocked(runWithLiveLogs).mockImplementation(async (_command, args) => {
    await writeFile(args[1], 'patched')
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(cache.root, { recursive: true, force: true })
})

test.each([
  ['win32', 'x64', 'gpupatch-cli-x86_64-pc-windows-msvc.exe'],
  ['linux', 'x64', 'gpupatch-cli-x86_64-unknown-linux-gnu'],
  ['darwin', 'x64', 'gpupatch-cli-x86_64-apple-darwin'],
  ['darwin', 'arm64', 'gpupatch-cli-aarch64-apple-darwin']
] satisfies [NodeJS.Platform, NodeJS.Architecture, string][])(
  'selects the %s-%s host asset',
  (platform, arch, asset) => {
    expect(gpupatchAssetName(platform, arch)).toBe(asset)
  }
)

test.each([
  ['linux', 'arm64'],
  ['win32', 'ia32'],
  ['win32', 'arm64'],
  ['freebsd', 'x64']
] satisfies [NodeJS.Platform, NodeJS.Architecture][])(
  'rejects unsupported host %s-%s',
  (platform, arch) => {
    expect(() => gpupatchAssetName(platform, arch)).toThrow('not available')
  }
)

test('downloads the pinned release once and makes its host asset executable', async () => {
  const executable = await ensureGpupatch(log)
  expect(await ensureGpupatch(log)).toBe(executable)
  expect(downloadFile).toHaveBeenCalledTimes(1)
  expect(vi.mocked(downloadFile).mock.calls[0][0]).toContain('/download/v0.2.1/')
  expect((await stat(executable)).mode & 0o777).toBe(0o755)
  expect(await readdir(join(cache.root, 'thirdparty', 'gpupatch', 'v0.2.1'))).toEqual([
    gpupatchAssetName('linux', 'x64')
  ])
})

test('cleans failed downloads and retries rather than caching a partial executable', async () => {
  vi.mocked(downloadFile).mockImplementationOnce(async (_url, path) => {
    await writeFile(path, 'partial')
    throw new Error('network failure')
  })
  await expect(ensureGpupatch(log)).rejects.toThrow('network failure')
  expect(await readdir(join(cache.root, 'thirdparty', 'gpupatch', 'v0.2.1'))).toEqual([])
  await ensureGpupatch(log)
  expect(downloadFile).toHaveBeenCalledTimes(2)
})

test('skips non-Windows targets before downloading or running a provider', async () => {
  await patchExecutableWithGpupatch(binary, 'darwin', { log })
  expect(downloadFile).not.toHaveBeenCalled()
  expect(runWithLiveLogs).not.toHaveBeenCalled()
  expect(await readFile(binary, 'utf8')).toBe('original')
})

test('patches Windows output on a Linux host and atomically replaces the executable', async () => {
  const abortSignal = new AbortController().signal
  await patchExecutableWithGpupatch(binary, 'win32', { log, abortSignal })
  expect(runWithLiveLogs).toHaveBeenCalledWith(
    expect.stringContaining(gpupatchAssetName('linux', 'x64')),
    [binary, expect.stringContaining('.gpupatch-')],
    { cancelSignal: abortSignal },
    log,
    expect.any(Object)
  )
  expect(await readFile(binary, 'utf8')).toBe('patched')
  expect((await readdir(cache.root)).filter((name) => name.startsWith('.gpupatch-'))).toEqual([])
})

test('retains the original executable and cleans output when patching fails', async () => {
  vi.mocked(runWithLiveLogs).mockImplementationOnce(async (_command, args) => {
    await writeFile(args[1], 'partial patch')
    throw new Error('patch failed')
  })
  await expect(patchExecutableWithGpupatch(binary, 'win32', { log })).rejects.toThrow(
    'patch failed'
  )
  expect(await readFile(binary, 'utf8')).toBe('original')
  expect((await readdir(cache.root)).filter((name) => name.startsWith('.gpupatch-'))).toEqual([])
})

test('retains the original executable when cancellation arrives after patch output', async () => {
  const controller = new AbortController()
  vi.mocked(runWithLiveLogs).mockImplementationOnce(async (_command, args) => {
    await writeFile(args[1], 'patched')
    controller.abort()
  })
  await expect(
    patchExecutableWithGpupatch(binary, 'win32', { log, abortSignal: controller.signal })
  ).rejects.toThrow()
  expect(await readFile(binary, 'utf8')).toBe('original')
  expect((await readdir(cache.root)).filter((name) => name.startsWith('.gpupatch-'))).toEqual([])
})

test('does not download or patch after an earlier cancellation', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    patchExecutableWithGpupatch(binary, 'win32', { log, abortSignal: controller.signal })
  ).rejects.toThrow()
  expect(downloadFile).not.toHaveBeenCalled()
  expect(runWithLiveLogs).not.toHaveBeenCalled()
})
