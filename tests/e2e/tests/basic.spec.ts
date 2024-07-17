import { it, expect, describe, vi } from 'vitest'
import { execa } from 'execa'
import { join } from 'path'
import { tmpdir, platform, arch } from 'os'
import { nanoid } from 'nanoid'
import { readFile } from 'fs/promises'

export const getBinFolder = () => {
  if (platform() === 'win32') {
    if (arch() === 'x64') {
      return 'Cyn-win32-x64'
    }
    throw new Error('Unsupported platform')
  } else if (platform() === 'darwin') {
    if (arch() === 'x64') {
      return 'Cyn-darwin-x64'
    }
    throw new Error('Unsupported platform')
  } else if (platform() === 'linux') {
    if (arch() === 'x64') {
      return 'Cyn-linux-x64'
    }
    throw new Error('Unsupported platform')
  }
}

const getBinName = () => {
  if (platform() === 'win32') {
    return 'Cyn.exe'
  }
  return 'Cyn'
}

const tmpLogFile = join(tmpdir(), nanoid() + 'cyn-app-test.log.json')
const root = process.cwd()

const binFolder = getBinFolder()
const binName = getBinName()

const bin = join(root, 'out', binFolder, binName)
// const bin = '/home/quentin/Projects/cyn-monorepo/out/@cyn-app-win32-x64/@cyn-app.exe'
console.log('bin', bin)

const fixtures = join(root, 'tests/e2e/fixtures')

console.log('fixtures', fixtures)
console.log('tmpLogFile', tmpLogFile)

describe('basic', () => {
  it(
    'package folder to electron',
    async () => {
      const jsonProject = join(fixtures, 'folder-to-electron.json')
      console.log('jsonProject', jsonProject)


      try {
        const { exitCode, stdout, stderr } = await execa(
          bin,
          ['--', '--project', jsonProject, '--action', 'run', '--output', tmpLogFile],
          {
            stdout: ['pipe', 'inherit'],
            stderr: ['pipe', 'inherit'],
            env: {}
          }
        )

        const result = JSON.parse(await readFile(tmpLogFile, 'utf8'))

        expect(exitCode).toBe(0)
        expect(result.steps).toBeDefined()
        expect(result.steps).toEqual({
          'electron-package-node': {
            outputs: {
              output: expect.any(String)
            }
          }
        })
      } catch (e) {
        console.log('e', e)
        throw e
      }
    },
    {
      timeout: 60_000
    }
  )

  it(
    'export c3',
    async () => {
      const jsonProject = join(fixtures, 'c3-export.json')
      console.log('jsonProject', jsonProject)


      try {
        const { exitCode, stdout, stderr } = await execa(
          bin,
          ['--', '--project', jsonProject, '--action', 'run', '--output', tmpLogFile],
          {
            stdout: ['pipe', 'inherit'],
            stderr: ['pipe', 'inherit'],
            env: {}
          }
        )

        const result = JSON.parse(await readFile(tmpLogFile, 'utf8'))

        expect(exitCode).toBe(0)
        expect(result.steps).toBeDefined()
        expect(result.steps).toEqual({
          'export-construct-project': {
            outputs: {
              folder: expect.any(String)
            }
          }
        })
      } catch (e) {
        console.log('e', e)
        throw e
      }
    },
    {
      timeout: 60_000
    }
  )
})
