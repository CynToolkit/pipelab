import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { dirname, join } from 'node:path'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { browserWindow } from '@@/tests/helpers.js'
import { ExportGodotRunner } from './export.js'
import {
  GODOT_VERSION,
  assertGodotTargetPlatform,
  buildGodotOutputPath,
  ensureUniquePresetName,
  findMatchingPreset,
  generatePresetConfig,
  godotDownloadUrl,
  godotEditorAssetName,
  godotEditorBinaryPath,
  godotExportArgs,
  godotOutputFileName,
  godotPresetPlatform,
  godotRunEnv,
  godotTemplatesAssetName,
  godotTemplatesDir,
  hostTargetPlatform,
  parseExportPresets,
  readGodotProjectName,
  validateGodotProject,
  GodotTargetPlatform
} from './godot.js'
import { stripFirstPathSegment } from './extract.js'

const { userDataDir, downloadMock, runWithLiveLogsMock } = vi.hoisted(() => {
  const osTmpdir = () =>
    process.platform === 'win32'
      ? process.env.TEMP || process.env.TMP || process.env.TMPDIR || 'C:\\Windows\\Temp'
      : process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'
  return {
    userDataDir: `${osTmpdir()}/pipelab-godot-test/userdata-${process.pid}`,
    downloadMock: vi.fn(),
    runWithLiveLogsMock: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir
  }
}))

vi.mock('@@/libs/plugin-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@@/libs/plugin-core')>()
  return {
    ...actual,
    downloadFile: downloadMock,
    runWithLiveLogs: runWithLiveLogsMock
  }
})

vi.mock('./extract.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./extract.js')>()
  return {
    ...actual,
    extractZip: vi.fn(),
    extractZipStripFirst: vi.fn()
  }
})

const editorFolder = join(userDataDir, 'thirdparty', 'godot', `v${GODOT_VERSION}`, 'editor')
const editorBinaryPath = () =>
  join(editorFolder, godotEditorBinaryPath(process.platform, process.arch))
const templatesVersionMarker = () =>
  join(godotTemplatesDir(userDataDir, process.platform), 'version.txt')

let projectCounter = 0
const makeProject = async (options?: { presets?: string; emptyPresets?: boolean }) => {
  const projectDir = join(userDataDir, `project-${process.pid}-${projectCounter++}`)
  await mkdir(projectDir, { recursive: true })
  await writeFile(
    join(projectDir, 'project.godot'),
    'config_version=5\n\n[application]\n\nconfig/name="My Game"\n'
  )
  if (options?.presets) {
    await writeFile(join(projectDir, 'export_presets.cfg'), options.presets)
  } else if (options?.emptyPresets) {
    await writeFile(join(projectDir, 'export_presets.cfg'), '')
  }
  return projectDir
}

const installGodot = async () => {
  await mkdir(editorFolder, { recursive: true })
  await writeFile(editorBinaryPath(), '')
  await mkdir(dirname(templatesVersionMarker()), { recursive: true })
  await writeFile(templatesVersionMarker(), GODOT_VERSION)
}

const installEditorOnly = async () => {
  await mkdir(editorFolder, { recursive: true })
  await writeFile(editorBinaryPath(), '')
}

const makeWorkspace = async () => mkdtemp(join(userDataDir, 'workspace-'))

const runExport = async (projectDir: string, target: GodotTargetPlatform, cwd: string) => {
  const outputs: Record<string, unknown> = {}
  await ExportGodotRunner({
    inputs: {
      project: projectDir,
      'target-platform': target
    },
    log: () => {},
    setOutput: (key, value) => {
      outputs[key] = value
    },
    meta: {},
    setMeta: () => {},
    cwd,
    paths: {
      unpack: '',
      assets: '',
      cache: '',
      pnpm: '',
      node: ''
    },
    api: undefined as never,
    browserWindow,
    abortSignal: new AbortController().signal
  })
  return outputs
}

beforeAll(async () => {
  await mkdir(userDataDir, { recursive: true })
})

afterAll(async () => {
  await rm(userDataDir, { recursive: true, force: true })
})

beforeEach(async () => {
  downloadMock.mockReset()
  runWithLiveLogsMock.mockReset()
  await rm(join(userDataDir, 'thirdparty'), { recursive: true, force: true })
})

test('maps target platforms to Godot preset platforms', () => {
  expect(godotPresetPlatform('windows')).toBe('Windows Desktop')
  expect(godotPresetPlatform('linux')).toBe('Linux')
  expect(godotPresetPlatform('macos')).toBe('macOS')
  expect(godotPresetPlatform('web')).toBe('Web')
})

test('detects the host target platform and defaults unknown hosts to windows', () => {
  expect(hostTargetPlatform('win32')).toBe('windows')
  expect(hostTargetPlatform('linux')).toBe('linux')
  expect(hostTargetPlatform('darwin')).toBe('macos')
  expect(() => hostTargetPlatform('freebsd')).toThrow()
})

test('asserts valid target platforms and rejects unknown ones', () => {
  expect(assertGodotTargetPlatform('windows')).toBe('windows')
  expect(assertGodotTargetPlatform('web')).toBe('web')
  expect(() => assertGodotTargetPlatform('android')).toThrow()
  expect(() => assertGodotTargetPlatform(null)).toThrow()
})

test('maps host platforms and architectures to Godot editor assets', () => {
  expect(godotEditorAssetName('win32', 'x64')).toBe(`Godot_v${GODOT_VERSION}-stable_win64.exe.zip`)
  expect(godotEditorAssetName('win32', 'arm64')).toBe(
    `Godot_v${GODOT_VERSION}-stable_windows_arm64.exe.zip`
  )
  expect(godotEditorAssetName('linux', 'x64')).toBe(
    `Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip`
  )
  expect(godotEditorAssetName('linux', 'arm64')).toBe(
    `Godot_v${GODOT_VERSION}-stable_linux.arm64.zip`
  )
  expect(godotEditorAssetName('darwin', 'arm64')).toBe(
    `Godot_v${GODOT_VERSION}-stable_macos.universal.zip`
  )
  expect(() => godotEditorAssetName('freebsd', 'x64')).toThrow()
})

test('resolves the editor binary path inside the extracted archives', () => {
  expect(godotEditorBinaryPath('linux', 'x64')).toBe(`Godot_v${GODOT_VERSION}-stable_linux.x86_64`)
  expect(godotEditorBinaryPath('win32', 'x64')).toBe(`Godot_v${GODOT_VERSION}-stable_win64.exe`)
  expect(godotEditorBinaryPath('darwin', 'arm64')).toBe(
    join('Godot.app', 'Contents', 'MacOS', 'Godot')
  )
})

test('builds download URLs from the Godot release tag', () => {
  expect(godotDownloadUrl(godotEditorAssetName('linux', 'x64'))).toBe(
    `https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip`
  )
})

test('builds the godot export command line', () => {
  expect(godotExportArgs('Pipelab Web', '/out/index.html')).toEqual([
    '--headless',
    '--export-release',
    'Pipelab Web',
    '/out/index.html'
  ])
})

test('builds output file names and paths per target platform', () => {
  expect(godotOutputFileName('windows', 'My Game')).toBe('My Game.exe')
  expect(godotOutputFileName('linux', 'My Game')).toBe('My Game.x86_64')
  expect(godotOutputFileName('macos', 'My Game')).toBe('My Game.app')
  expect(godotOutputFileName('web', 'My Game')).toBe('index.html')
  expect(buildGodotOutputPath('/workspace', 'web', 'My Game')).toBe(
    join('/workspace', 'godot-export', 'web', 'index.html')
  )
})

test('points Godot data dirs at the thirdparty folder', () => {
  const userData = '/user-data'
  expect(godotTemplatesDir(userData, 'linux')).toBe(
    join(
      userData,
      'thirdparty',
      'godot',
      'xdg-data',
      'godot',
      'export_templates',
      `${GODOT_VERSION}.stable`
    )
  )
  expect(godotRunEnv(userData, 'linux')).toEqual({
    XDG_DATA_HOME: join(userData, 'thirdparty', 'godot', 'xdg-data')
  })
  expect(godotRunEnv(userData, 'win32')).toEqual({
    APPDATA: join(userData, 'thirdparty', 'godot', 'appdata')
  })
  expect(godotRunEnv(userData, 'darwin')).toEqual({
    HOME: join(userData, 'thirdparty', 'godot', 'home')
  })
})

test('parses export_presets.cfg into presets', () => {
  const content = `
[preset.0]

name="Windows Desktop"
platform="Windows Desktop"
runnable=true
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="build/windows.exe"

[preset.0.options]

custom_template/debug=""
custom_template/release=""

[preset.1]

name="Web"
platform="Web"
runnable=true
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path=""
`
  const presets = parseExportPresets(content)
  expect(presets).toHaveLength(2)
  expect(presets[0]).toMatchObject({
    index: 0,
    name: 'Windows Desktop',
    platform: 'Windows Desktop',
    exportPath: 'build/windows.exe'
  })
  expect(presets[1]).toMatchObject({ index: 1, name: 'Web', platform: 'Web' })
})

test('finds the preset matching a target platform', () => {
  const presets = [
    { index: 0, name: 'Windows Desktop', platform: 'Windows Desktop' },
    { index: 1, name: 'Web', platform: 'Web' }
  ]
  expect(findMatchingPreset(presets, 'web')).toMatchObject({ name: 'Web' })
  expect(findMatchingPreset(presets, 'linux')).toBeUndefined()
})

test('generates unique preset names', () => {
  const presets = [{ index: 0, name: 'Pipelab Web', platform: 'Web' }]
  expect(ensureUniquePresetName([], 'Pipelab Web')).toBe('Pipelab Web')
  expect(ensureUniquePresetName(presets, 'Pipelab Web')).toBe('Pipelab Web 2')
  expect(
    ensureUniquePresetName(
      [...presets, { index: 1, name: 'Pipelab Web 2', platform: 'Web' }],
      'Pipelab Web'
    )
  ).toBe('Pipelab Web 3')
})

test('generates a minimal export preset config', () => {
  const config = generatePresetConfig(0, 'Pipelab Web', 'Web', 'C:\\out\\index.html')
  expect(config).toContain('[preset.0]')
  expect(config).toContain('name="Pipelab Web"')
  expect(config).toContain('platform="Web"')
  expect(config).toContain('export_path="C:/out/index.html"')
})

test('strips the first path segment of archive entries', () => {
  expect(stripFirstPathSegment('templates/version.txt')).toBe('version.txt')
  expect(stripFirstPathSegment('Godot_v4.4.1-stable_linux.x86_64')).toBe(
    'Godot_v4.4.1-stable_linux.x86_64'
  )
})

test('reads the project name from project.godot', async () => {
  const projectDir = await makeProject()
  expect(await readGodotProjectName(projectDir)).toBe('My Game')
})

test('validates a Godot 4 project and rejects missing or older projects', async () => {
  const valid = await makeProject()
  await expect(validateGodotProject(valid)).resolves.toBeUndefined()

  const missing = join(userDataDir, `no-project-${projectCounter++}`)
  await expect(validateGodotProject(missing)).rejects.toThrow(/project.godot/)

  const older = join(userDataDir, `older-project-${projectCounter++}`)
  await mkdir(older, { recursive: true })
  await writeFile(join(older, 'project.godot'), 'config_version=4\n')
  await expect(validateGodotProject(older)).rejects.toThrow(/config_version/)
})

test('exports using an existing preset', async () => {
  await installGodot()
  const projectDir = await makeProject({
    presets: `[preset.0]

name="Windows Desktop"
platform="Windows Desktop"
runnable=true
export_filter="all_resources"
export_path="out/MyGame.exe"
`
  })
  const workspace = await makeWorkspace()
  const outputPath = join(projectDir, 'out', 'MyGame.exe')
  const abortSignal = new AbortController().signal

  runWithLiveLogsMock.mockImplementation(async () => {
    await writeFile(outputPath, '')
  })

  const outputs = await runExport(projectDir, 'windows', workspace)

  expect(runWithLiveLogsMock).toHaveBeenCalledTimes(1)
  const [command, args, options] = runWithLiveLogsMock.mock.calls[0]
  expect(command).toBe(editorBinaryPath())
  expect(args).toEqual(['--headless', '--export-release', 'Windows Desktop', outputPath])
  expect(options).toMatchObject({
    cwd: projectDir,
    cancelSignal: abortSignal,
    env: godotRunEnv(userDataDir, process.platform)
  })

  expect(outputs).toEqual({
    output: outputPath,
    parentFolder: dirname(outputPath),
    folder: dirname(outputPath)
  })
})

test('generates a preset when none matches the target platform', async () => {
  await installGodot()
  const projectDir = await makeProject({ emptyPresets: true })
  const workspace = await makeWorkspace()
  const outputPath = join(workspace, 'godot-export', 'web', 'index.html')

  runWithLiveLogsMock.mockImplementation(async () => {
    await writeFile(outputPath, '')
  })

  const outputs = await runExport(projectDir, 'web', workspace)

  const config = await readFile(join(projectDir, 'export_presets.cfg'), 'utf-8')
  expect(config).toContain('[preset.0]')
  expect(config).toContain('name="Pipelab Web"')
  expect(config).toContain('platform="Web"')
  expect(config).toContain(`export_path="${outputPath.replace(/\\/g, '/')}"`)

  const [command, args] = runWithLiveLogsMock.mock.calls[0]
  expect(command).toBe(editorBinaryPath())
  expect(args).toEqual(['--headless', '--export-release', 'Pipelab Web', outputPath])

  expect(outputs).toEqual({
    output: outputPath,
    parentFolder: dirname(outputPath),
    folder: dirname(outputPath)
  })
})

test('downloads the Godot editor when it is missing', async () => {
  await mkdir(dirname(templatesVersionMarker()), { recursive: true })
  await writeFile(templatesVersionMarker(), GODOT_VERSION)

  const extract = await import('./extract.js')
  const extractZipStripFirst = vi.mocked(extract.extractZipStripFirst)
  const extractZip = vi.mocked(extract.extractZip)
  const installEditor = async () => {
    await mkdir(editorFolder, { recursive: true })
    await writeFile(editorBinaryPath(), '')
  }
  extractZipStripFirst.mockImplementation(installEditor)
  extractZip.mockImplementation(installEditor)

  const projectDir = await makeProject({ emptyPresets: true })
  const workspace = await makeWorkspace()
  const outputPath = join(workspace, 'godot-export', 'web', 'index.html')

  runWithLiveLogsMock.mockImplementation(async () => {
    await writeFile(outputPath, '')
  })

  await runExport(projectDir, 'web', workspace)

  expect(downloadMock).toHaveBeenCalledTimes(1)
  expect(downloadMock.mock.calls[0][0]).toBe(
    godotDownloadUrl(godotEditorAssetName(process.platform, process.arch))
  )
  expect(runWithLiveLogsMock.mock.calls[0][0]).toBe(editorBinaryPath())
})

test('downloads the export templates when they are missing', async () => {
  await installEditorOnly()

  const projectDir = await makeProject({ emptyPresets: true })
  const workspace = await makeWorkspace()
  const outputPath = join(workspace, 'godot-export', 'web', 'index.html')

  runWithLiveLogsMock.mockImplementation(async () => {
    await writeFile(outputPath, '')
  })

  await runExport(projectDir, 'web', workspace)

  expect(downloadMock).toHaveBeenCalledTimes(1)
  expect(downloadMock.mock.calls[0][0]).toBe(godotDownloadUrl(godotTemplatesAssetName()))
})

test('throws when the export produces no output file', async () => {
  await installGodot()
  const projectDir = await makeProject({ emptyPresets: true })
  const workspace = await makeWorkspace()

  await expect(runExport(projectDir, 'web', workspace)).rejects.toThrow(/no output found/)
})
