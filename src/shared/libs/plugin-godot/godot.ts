import { createAction, createPathParam } from '@pipelab/plugin-core'
import { basename, join } from 'node:path'

export const ID = 'godot-export'

export const GODOT_VERSION = '4.4.1'
export const GODOT_TAG = `${GODOT_VERSION}-stable`
export const GODOT_RELEASE_URL = 'https://github.com/godotengine/godot/releases/download'

export type GodotTargetPlatform = 'windows' | 'linux' | 'macos' | 'web'

export const GODOT_PLATFORMS: ReadonlyArray<{ label: string; value: GodotTargetPlatform }> = [
  { label: 'Windows', value: 'windows' },
  { label: 'Linux', value: 'linux' },
  { label: 'macOS', value: 'macos' },
  { label: 'Web', value: 'web' }
]

export const godotPresetPlatform = (target: GodotTargetPlatform): string => {
  switch (target) {
    case 'windows':
      return 'Windows Desktop'
    case 'linux':
      return 'Linux'
    case 'macos':
      return 'macOS'
    case 'web':
      return 'Web'
  }
}

export const hostTargetPlatform = (platform: NodeJS.Platform): GodotTargetPlatform => {
  switch (platform) {
    case 'win32':
      return 'windows'
    case 'linux':
      return 'linux'
    case 'darwin':
      return 'macos'
    default:
      throw new Error(`Godot export is not supported on platform ${platform}`)
  }
}

export const defaultTargetPlatform = (platform: NodeJS.Platform): GodotTargetPlatform => {
  try {
    return hostTargetPlatform(platform)
  } catch {
    return 'windows'
  }
}

export const assertGodotTargetPlatform = (
  value: string | null | undefined
): GodotTargetPlatform => {
  if (value === 'windows' || value === 'linux' || value === 'macos' || value === 'web') {
    return value
  }
  throw new Error(`Invalid Godot target platform: ${value}`)
}

export const godotDownloadUrl = (assetName: string): string =>
  `${GODOT_RELEASE_URL}/${GODOT_TAG}/${assetName}`

export const godotEditorAssetName = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture
): string => {
  if (platform === 'win32') {
    return arch === 'arm64'
      ? `Godot_v${GODOT_VERSION}-stable_windows_arm64.exe.zip`
      : `Godot_v${GODOT_VERSION}-stable_win64.exe.zip`
  }
  if (platform === 'linux') {
    return arch === 'arm64'
      ? `Godot_v${GODOT_VERSION}-stable_linux.arm64.zip`
      : `Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip`
  }
  if (platform === 'darwin') {
    return `Godot_v${GODOT_VERSION}-stable_macos.universal.zip`
  }
  throw new Error(`Godot editor is not available for ${platform}-${arch}`)
}

export const godotEditorFileName = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture
): string => {
  if (platform === 'win32') {
    return arch === 'arm64'
      ? `Godot_v${GODOT_VERSION}-stable_windows_arm64.exe`
      : `Godot_v${GODOT_VERSION}-stable_win64.exe`
  }
  if (platform === 'linux') {
    return arch === 'arm64'
      ? `Godot_v${GODOT_VERSION}-stable_linux.arm64`
      : `Godot_v${GODOT_VERSION}-stable_linux.x86_64`
  }
  throw new Error(`Godot editor binary is not a single file on ${platform}`)
}

export const godotEditorBinaryPath = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture
): string => {
  if (platform === 'darwin') {
    return join('Godot.app', 'Contents', 'MacOS', 'Godot')
  }
  return godotEditorFileName(platform, arch)
}

export const godotTemplatesAssetName = (): string =>
  `Godot_v${GODOT_VERSION}-stable_export_templates.tpz`

export const godotOutputFileName = (target: GodotTargetPlatform, projectName: string): string => {
  switch (target) {
    case 'windows':
      return `${projectName}.exe`
    case 'linux':
      return `${projectName}.x86_64`
    case 'macos':
      return `${projectName}.app`
    case 'web':
      return 'index.html'
  }
}

export const buildGodotOutputPath = (
  cwd: string,
  target: GodotTargetPlatform,
  projectName: string
): string => join(cwd, 'godot-export', target, godotOutputFileName(target, projectName))

export const godotExportArgs = (presetName: string, outputPath: string): string[] => [
  '--headless',
  '--export-release',
  presetName,
  outputPath
]

export const godotTemplatesVersionDir = (): string => `${GODOT_VERSION}.stable`

export const godotDataDir = (userData: string, platform: NodeJS.Platform): string => {
  const thirdparty = join(userData, 'thirdparty', 'godot')
  switch (platform) {
    case 'win32':
      return join(thirdparty, 'appdata', 'Godot')
    case 'darwin':
      return join(thirdparty, 'home', 'Library', 'Application Support', 'Godot')
    default:
      return join(thirdparty, 'xdg-data', 'godot')
  }
}

export const godotTemplatesDir = (userData: string, platform: NodeJS.Platform): string =>
  join(godotDataDir(userData, platform), 'export_templates', godotTemplatesVersionDir())

export const godotRunEnv = (
  userData: string,
  platform: NodeJS.Platform
): Record<string, string> => {
  const thirdparty = join(userData, 'thirdparty', 'godot')
  switch (platform) {
    case 'win32':
      return { APPDATA: join(thirdparty, 'appdata') }
    case 'darwin':
      return { HOME: join(thirdparty, 'home') }
    default:
      return { XDG_DATA_HOME: join(thirdparty, 'xdg-data') }
  }
}

export interface GodotPreset {
  index: number
  name: string
  platform: string
  exportPath?: string
}

export const parseExportPresets = (content: string): GodotPreset[] => {
  const presets: GodotPreset[] = []
  let current: GodotPreset | undefined
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('[')) {
      if (current) {
        presets.push(current)
        current = undefined
      }
      const match = /^\[preset\.(\d+)\]$/.exec(line)
      if (match) {
        current = { index: parseInt(match[1], 10), name: '', platform: '' }
      }
      continue
    }
    if (!current || line === '' || line.startsWith('#') || line.startsWith(';')) {
      continue
    }
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) {
      continue
    }
    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    if (key === 'name') {
      current.name = value
    } else if (key === 'platform') {
      current.platform = value
    } else if (key === 'export_path') {
      current.exportPath = value
    }
  }
  if (current) {
    presets.push(current)
  }
  return presets
}

export const findMatchingPreset = (
  presets: GodotPreset[],
  target: GodotTargetPlatform
): GodotPreset | undefined =>
  presets.find((preset) => preset.platform === godotPresetPlatform(target))

export const ensureUniquePresetName = (presets: GodotPreset[], desired: string): string => {
  const names = new Set(presets.map((preset) => preset.name))
  if (!names.has(desired)) {
    return desired
  }
  let suffix = 2
  while (names.has(`${desired} ${suffix}`)) {
    suffix += 1
  }
  return `${desired} ${suffix}`
}

export const generatePresetConfig = (
  index: number,
  name: string,
  platform: string,
  exportPath: string
): string => {
  const normalizedPath = exportPath.replace(/\\/g, '/')
  return `[preset.${index}]

name="${name}"
platform="${platform}"
runnable=true
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="${normalizedPath}"
patches=PackedStringArray()
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.${index}.options]

custom_template/debug=""
custom_template/release=""
`
}

export const readGodotProjectName = async (projectPath: string): Promise<string> => {
  const { readFile } = await import('node:fs/promises')
  const content = await readFile(join(projectPath, 'project.godot'), 'utf-8')
  const match = /^\s*config\/name\s*=\s*"(.*)"\s*$/m.exec(content)
  return match ? match[1] : basename(projectPath)
}

export const validateGodotProject = async (projectPath: string): Promise<void> => {
  const { fileExists } = await import('@@/libs/plugin-core')
  const projectFile = join(projectPath, 'project.godot')
  if (!(await fileExists(projectFile))) {
    throw new Error(`Godot project not found: no project.godot in ${projectPath}`)
  }
  const { readFile } = await import('node:fs/promises')
  const content = await readFile(projectFile, 'utf-8')
  const versionMatch = /^\s*config_version\s*=\s*(\d+)\s*$/m.exec(content)
  if (versionMatch && parseInt(versionMatch[1], 10) !== 5) {
    throw new Error(
      `Unsupported Godot project config_version "${versionMatch[1]}". Expected 5 (Godot 4.x).`
    )
  }
}

export const exportGodotAction = createAction({
  id: ID,
  name: 'Export Godot project',
  description:
    'Exports a Godot 4.x project for Windows, Linux, macOS or Web using the official headless editor. Godot and the export templates are downloaded on first use.',
  icon: 'mdi-gamepad-variant',
  displayString:
    '`Export Godot project ${fmt.param(params["target-platform"], "primary", "for host platform")}`',
  meta: {},
  params: {
    project: createPathParam('', {
      required: true,
      label: 'Godot project folder',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    }),
    'target-platform': {
      value: defaultTargetPlatform(process.platform),
      required: false,
      label: 'Target platform',
      description:
        'The platform to export for. When no matching preset exists in export_presets.cfg, one is generated automatically. Defaults to the host platform.',
      control: {
        type: 'select',
        options: {
          placeholder: 'Target platform',
          options: [...GODOT_PLATFORMS]
        }
      }
    }
  },
  outputs: {
    output: {
      value: '',
      label: 'Output file'
    },
    parentFolder: {
      value: '',
      label: 'Parent folder'
    },
    folder: {
      value: '',
      label: 'Folder',
      deprecated: true
    }
  }
})
