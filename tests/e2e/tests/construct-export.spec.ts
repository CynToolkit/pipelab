import { it, expect, describe } from 'vitest'
import { execa } from 'execa'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { nanoid } from 'nanoid'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { getBinName, name, outFolderName } from '../../../src/constants'
import { platform, arch } from 'process'

const root = process.cwd()

const binFolder = outFolderName('Pipelab', platform, arch)
const binName = getBinName(name)

const bin = join(root, 'out', binFolder, binName)
console.log('bin', bin)

const fixtures = join(root, 'tests/e2e/fixtures')
console.log('fixtures', fixtures)

const VERSIONS = [
  { label: 'stable (latest)', version: '' },
  { label: 'stable r495-2', version: 'r495-2' },
  { label: 'beta', version: 'beta' },
  { label: 'LTS r449-5', version: 'r449-5' }
]

async function createLoginProject(
  baseFixture: string,
  username: string,
  password: string,
  version: string
) {
  const baseProject = JSON.parse(await readFile(join(fixtures, baseFixture), 'utf8'))

  const loginProject = {
    ...baseProject,
    canvas: {
      ...baseProject.canvas,
      blocks: baseProject.canvas.blocks.map((block) => {
        if (block.uid === 'export-construct-project') {
          return {
            ...block,
            params: {
              ...block.params,
              username: {
                editor: 'editor',
                value: username
              },
              password: {
                editor: 'editor',
                value: password
              },
              version: {
                editor: 'editor',
                value: version
              }
            }
          }
        }
        return block
      })
    }
  }

  const jsonProject = join(tmpdir(), nanoid() + 'c3-export-login.json')
  await mkdir(dirname(jsonProject), { recursive: true })
  await writeFile(jsonProject, JSON.stringify(loginProject), 'utf8')
  return jsonProject
}

describe('Construct 3 Export', () => {
  describe.each(VERSIONS)('$label', ({ version }) => {
    it(
      'should export without login (logged out)',
      {
        timeout: 180_000
      },
      async () => {
        const tmpLogFile = join(tmpdir(), nanoid() + 'pipelab-c3-logout-test.log.json')

        // Create a versioned project fixture
        const baseProject = JSON.parse(
          await readFile(join(fixtures, 'c3-export.json'), 'utf8')
        )

        const versionedProject = {
          ...baseProject,
          canvas: {
            ...baseProject.canvas,
            blocks: baseProject.canvas.blocks.map((block) => {
              if (block.uid === 'export-construct-project') {
                return {
                  ...block,
                  params: {
                    ...block.params,
                    version: {
                      editor: 'editor',
                      value: version
                    }
                  }
                }
              }
              return block
            })
          }
        }

        const jsonProject = join(tmpdir(), nanoid() + 'c3-export-logout.json')
        await mkdir(dirname(jsonProject), { recursive: true })
        await writeFile(jsonProject, JSON.stringify(versionedProject), 'utf8')

        console.log('jsonProject', jsonProject)

        try {
          const { exitCode } = await execa(
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
                folder: expect.any(String),
                parentFolder: expect.any(String),
                zipFile: expect.any(String)
              }
            }
          })
        } catch (e) {
          console.log('e', e)
          throw e
        }
      }
    )

    it(
      'should export with login credentials (logged in)',
      {
        timeout: 180_000
      },
      async () => {
        const username = process.env.C3_USERNAME
        const password = process.env.C3_PASSWORD

        if (!username || !password) {
          console.log('Skipping login test: C3_USERNAME and C3_PASSWORD env vars not set')
          return
        }

        const tmpLogFile = join(tmpdir(), nanoid() + 'pipelab-c3-login-test.log.json')
        const jsonProject = await createLoginProject('c3-export.json', username, password, version)

        console.log('jsonProject (with login)', jsonProject)

        try {
          const { exitCode } = await execa(
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
                folder: expect.any(String),
                parentFolder: expect.any(String),
                zipFile: expect.any(String)
              }
            }
          })
        } catch (e) {
          console.log('e', e)
          throw e
        }
      }
    )
  })
})
