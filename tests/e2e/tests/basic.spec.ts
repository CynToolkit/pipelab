import { it, expect, describe, vi } from 'vitest'
import { execa } from 'execa'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { nanoid } from 'nanoid'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { getBinName, name, outFolderName } from '../../../src/constants'
import { platform, arch } from 'process'

const tmpLogFile = join(tmpdir(), nanoid() + 'pipelab-app-test.log.json')
const root = process.cwd()

const binFolder = outFolderName('Pipelab', platform, arch)
const binName = getBinName(name)

const bin = join(root, 'out', binFolder, binName)
// const bin = '/home/quentin/Projects/pipelab-monorepo/out/@pipelab-app-win32-x64/@pipelab-app.exe'
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

        const output = result.steps['electron-package-node'].outputs.output
        const outputRun = await execa(join(output, binName), [])

        expect(outputRun.exitCode).toBe(0)
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
      // const { testC3Unzip } = await import('../../../src/main/presets/test-c3-unzip')

      // const project = await testC3Unzip()

      // console.log('project', project)
      // // const jsonProject = join(fixtures, 'c3-export.json')
      // const jsonProjectData = JSON.stringify(project.data)
      // console.log('jsonProjectData', jsonProjectData)

      // const jsonProject = join(tmpdir(), nanoid(), 'c3-export.json')

      // await mkdir(dirname(jsonProject), {
      //   recursive: true,
      // })

      // console.log('jsonProject', jsonProject)

      // await writeFile(jsonProject, jsonProjectData)

      const jsonProject = join(fixtures, 'c3-export.json')

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
