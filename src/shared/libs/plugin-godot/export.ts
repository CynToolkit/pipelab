import { createActionRunner } from '@pipelab/plugin-core'
import {
  assertGodotTargetPlatform,
  buildGodotOutputPath,
  ensureUniquePresetName,
  findMatchingPreset,
  generatePresetConfig,
  godotDownloadUrl,
  godotEditorAssetName,
  godotEditorBinaryPath,
  godotExportArgs,
  godotPresetPlatform,
  godotRunEnv,
  godotTemplatesAssetName,
  godotTemplatesDir,
  GODOT_VERSION,
  GodotPreset,
  parseExportPresets,
  readGodotProjectName,
  validateGodotProject,
  exportGodotAction
} from './godot'

export const ensureGodotEditor = async (
  log: typeof console.log,
  abortSignal?: AbortSignal
): Promise<string> => {
  const { app } = await import('electron')
  const userData = app.getPath('userData')
  const { chmod, mkdir, rm } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const { downloadFile, fileExists } = await import('@@/libs/plugin-core')
  const { extractZip, extractZipStripFirst } = await import('./extract')

  const godotFolder = join(userData, 'thirdparty', 'godot', `v${GODOT_VERSION}`)
  const editorFolder = join(godotFolder, 'editor')
  const editorPath = join(editorFolder, godotEditorBinaryPath(process.platform, process.arch))

  if (await fileExists(editorPath)) {
    return editorPath
  }

  const assetName = godotEditorAssetName(process.platform, process.arch)
  const url = godotDownloadUrl(assetName)
  log('Downloading Godot editor from', url)

  const zipPath = join(godotFolder, assetName)
  await mkdir(dirname(zipPath), { recursive: true })
  await downloadFile(
    url,
    zipPath,
    {
      onProgress: ({ progress }) => {
        log(`Downloading Godot editor: ${progress.toFixed(2)}%`)
      }
    },
    abortSignal
  )

  if (process.platform === 'darwin') {
    await extractZip(zipPath, editorFolder)
  } else {
    await extractZipStripFirst(zipPath, editorFolder)
  }

  await rm(zipPath, { force: true })

  if (process.platform !== 'win32') {
    try {
      await chmod(editorPath, 0o755)
    } catch {
      // Ignore chmod failures (e.g. filesystems without POSIX permissions).
    }
  }

  return editorPath
}

export const ensureGodotTemplates = async (
  log: typeof console.log,
  abortSignal?: AbortSignal
): Promise<string> => {
  const { app } = await import('electron')
  const userData = app.getPath('userData')
  const { mkdir, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { downloadFile } = await import('@@/libs/plugin-core')
  const { extractZipStripFirst } = await import('./extract')

  const thirdparty = join(userData, 'thirdparty', 'godot')
  const templatesDir = godotTemplatesDir(userData, process.platform)
  const assetName = godotTemplatesAssetName()
  const url = godotDownloadUrl(assetName)
  log('Downloading Godot export templates from', url)

  const zipPath = join(thirdparty, assetName)
  await mkdir(thirdparty, { recursive: true })
  await downloadFile(
    url,
    zipPath,
    {
      onProgress: ({ progress }) => {
        log(`Downloading Godot export templates: ${progress.toFixed(2)}%`)
      }
    },
    abortSignal
  )

  await extractZipStripFirst(zipPath, templatesDir)
  await rm(zipPath, { force: true })

  return templatesDir
}

export const ExportGodotRunner = createActionRunner<typeof exportGodotAction>(
  async ({ log, inputs, setOutput, cwd, abortSignal }) => {
    const { app } = await import('electron')
    const userData = app.getPath('userData')
    const { mkdir, readFile, writeFile } = await import('node:fs/promises')
    const { dirname, join, resolve } = await import('node:path')
    const { fileExists, runWithLiveLogs } = await import('@@/libs/plugin-core')

    const target = assertGodotTargetPlatform(inputs['target-platform'])
    const project = inputs.project

    log('Godot export', target, 'from', project)

    await validateGodotProject(project)

    const projectName = await readGodotProjectName(project)
    log('Godot project name:', projectName)

    const presetsPath = join(project, 'export_presets.cfg')
    let presets: GodotPreset[] = []
    if (await fileExists(presetsPath)) {
      presets = parseExportPresets(await readFile(presetsPath, 'utf-8'))
      log(`Found ${presets.length} export preset(s)`)
    } else {
      log('No export_presets.cfg found, a preset will be generated')
    }

    let preset = findMatchingPreset(presets, target)
    if (!preset) {
      const presetName = ensureUniquePresetName(presets, `Pipelab ${godotPresetPlatform(target)}`)
      const presetIndex = presets.reduce((max, p) => Math.max(max, p.index + 1), 0)
      const generatedOutputPath = buildGodotOutputPath(cwd, target, projectName)
      const config = generatePresetConfig(
        presetIndex,
        presetName,
        godotPresetPlatform(target),
        generatedOutputPath
      )
      const existingContent = await readFile(presetsPath, 'utf-8').catch(() => '')
      await writeFile(presetsPath, `${existingContent}${existingContent ? '\n' : ''}${config}`)
      preset = {
        index: presetIndex,
        name: presetName,
        platform: godotPresetPlatform(target),
        exportPath: generatedOutputPath
      }
      presets = [...presets, preset]
      log('Generated preset', presetName, 'for', godotPresetPlatform(target))
    }

    const outputPath = preset.exportPath?.trim()
      ? preset.exportPath
      : buildGodotOutputPath(cwd, target, projectName)
    const resolvedOutput = resolve(project, outputPath)
    await mkdir(dirname(resolvedOutput), { recursive: true })

    const editorPath = await ensureGodotEditor(log, abortSignal)
    log('Using Godot editor at', editorPath)

    const templatesDir = godotTemplatesDir(userData, process.platform)
    if (!(await fileExists(join(templatesDir, 'version.txt')))) {
      await ensureGodotTemplates(log, abortSignal)
    }

    log('Exporting to', resolvedOutput)
    await runWithLiveLogs(
      editorPath,
      godotExportArgs(preset.name, resolvedOutput),
      {
        cwd: project,
        cancelSignal: abortSignal,
        env: {
          ...godotRunEnv(userData, process.platform)
        }
      },
      log,
      {
        onStdout(data) {
          log(data)
        },
        onStderr(data) {
          log(data)
        }
      }
    )

    if (!(await fileExists(resolvedOutput))) {
      throw new Error(`Godot export finished but no output found at ${resolvedOutput}`)
    }

    setOutput('output', resolvedOutput)
    setOutput('parentFolder', dirname(resolvedOutput))
    setOutput('folder', dirname(resolvedOutput))
    log('Godot export complete:', resolvedOutput)
  }
)
