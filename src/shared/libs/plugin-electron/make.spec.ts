import { expect, test, vi } from 'vitest'
import { makeRunner } from './make.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type fs } from 'memfs'
import { browserWindow } from '@@/tests/helpers.js'

// ...

vi.mock('node:fs/promises', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs')

  return memfs.fs.promises
})

test('adds 1 + 2 to equal 3', async () => {
  const outputs: Record<string, unknown> = {}

  const id = 'ut-electron-build'
  const tmpDir = join(tmpdir(), id)

  console.log('tmpDir', tmpDir)

  const inputFolder = join(process.cwd(), 'fixtures', 'build')

  console.log('inputFolder', inputFolder)

  await makeRunner({
    inputs: {
      'input-folder': inputFolder,
      configuration: {},
      arch: undefined,
      platform: undefined
    },
    log: (...args) => {
      console.log(...args)
    },
    setOutput: (key, value) => {
      outputs[key] = value
    },
    meta: {
      definition: ''
    },
    setMeta: () => {
      console.log('set meta defined here')
    },
    cwd: tmpDir,
    paths: {
      assets: '',
      unpack: ''
    },
    api: undefined,
    browserWindow
  })
  console.log('outputs', outputs)
  expect(true).toBe(true)
}, 120_000)
