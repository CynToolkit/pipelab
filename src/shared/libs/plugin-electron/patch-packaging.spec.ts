import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runWithLiveLogs } from '../plugin-core'
import { configureParams, createPackageV2Props, forge } from './forge'
import { defaultElectronConfig } from './utils'
import { patchExecutableWithGpupatch } from './gpupatch'
import { NVPatch } from '../plugin-nvpatch/nvpatch'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('@@/plugins', () => ({ detectRuntime: vi.fn() }))
vi.mock('./gpupatch', () => ({ patchExecutableWithGpupatch: vi.fn() }))
vi.mock('../plugin-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../plugin-core')>()),
  runWithLiveLogs: vi.fn()
}))

let root: string
let options: Parameters<typeof forge>[2]

beforeEach(async () => {
  vi.clearAllMocks()
  root = await mkdtemp(join(tmpdir(), 'pipelab-patch-packaging-'))
  const template = join(root, 'assets', 'electron', 'template', 'app')
  await mkdir(join(template, 'src'), { recursive: true })
  await writeFile(join(template, 'package.json'), JSON.stringify({ name: 'template' }))
  options = {
    cwd: root,
    log: vi.fn(),
    inputs: { platform: 'win32', arch: 'x64' },
    setOutput: vi.fn(),
    setMeta: vi.fn(),
    meta: {},
    paths: {
      assets: join(root, 'assets'),
      unpack: root,
      node: process.execPath,
      pnpm: '',
      cache: root
    },
    api: undefined,
    browserWindow: undefined,
    abortSignal: new AbortController().signal
  }
  vi.mocked(runWithLiveLogs).mockResolvedValue(undefined)
  vi.mocked(patchExecutableWithGpupatch).mockResolvedValue(undefined)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('exposes an opt-in Windows checkbox and retains the deprecated nvpatch action', () => {
  expect(defaultElectronConfig.patchExecutable).toBe(false)
  expect(configureParams.patchExecutable).toMatchObject({
    label: 'Patch executable',
    platforms: ['win32'],
    value: false
  })
  expect(createPackageV2Props('test', '', '', '', '').params.patchExecutable).toBe(
    configureParams.patchExecutable
  )
  expect(NVPatch).toMatchObject({ id: 'nvpatch', deprecated: true })
  expect(NVPatch.deprecatedMessage).toContain('Patch executable')
})

test('publishes the Windows target path after patching succeeds on a different host', async () => {
  const binary = join(root, 'build', 'out', 'My Game-win32-x64', 'My Game.exe')
  vi.mocked(patchExecutableWithGpupatch).mockImplementationOnce(async () => {
    expect(options.setOutput).not.toHaveBeenCalled()
  })
  const output = await forge('package', undefined, options, {
    ...defaultElectronConfig,
    name: 'My Game',
    patchExecutable: true
  })
  expect(patchExecutableWithGpupatch).toHaveBeenCalledWith(binary, 'win32', {
    log: options.log,
    abortSignal: options.abortSignal
  })
  expect(output?.binary).toBe(binary)
  expect(options.setOutput).toHaveBeenCalledTimes(1)
})

test('does not patch existing configurations with the default disabled', async () => {
  await forge('package', undefined, options, { ...defaultElectronConfig })
  expect(patchExecutableWithGpupatch).not.toHaveBeenCalled()
})

test('propagates patch failures and does not publish a successful output', async () => {
  vi.mocked(patchExecutableWithGpupatch).mockRejectedValueOnce(new Error('patch failed'))
  await expect(
    forge('package', undefined, options, { ...defaultElectronConfig, patchExecutable: true })
  ).rejects.toThrow('patch failed')
  expect(options.setOutput).not.toHaveBeenCalled()
})

test('does not patch stale output after the package command fails', async () => {
  vi.mocked(runWithLiveLogs).mockImplementation(async (_command, args) => {
    if (args.includes('package')) {
      throw new Error('package failed')
    }
  })
  await expect(
    forge('package', undefined, options, { ...defaultElectronConfig, patchExecutable: true })
  ).rejects.toThrow('package failed')
  expect(patchExecutableWithGpupatch).not.toHaveBeenCalled()
  expect(options.setOutput).not.toHaveBeenCalled()
})

test.each(['make', 'preview'] as const)('does not patch a %s action', async (action) => {
  await forge(action, undefined, options, { ...defaultElectronConfig, patchExecutable: true })
  expect(patchExecutableWithGpupatch).not.toHaveBeenCalled()
})
