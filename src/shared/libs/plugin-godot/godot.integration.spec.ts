import { describe, expect, test } from 'vitest'
import { execa } from 'execa'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileExists } from '@@/libs/plugin-core'
import { GODOT_VERSION, generatePresetConfig } from './godot.js'

interface GodotBinary {
  binary: string
  version: string
}

const findGodot = async (): Promise<GodotBinary | undefined> => {
  const candidates: string[] = []
  if (process.env.GODOT_BIN) {
    candidates.push(process.env.GODOT_BIN)
  } else {
    candidates.push('godot')
  }
  for (const binary of candidates) {
    try {
      const { stdout } = await execa(binary, ['--version'], { timeout: 30_000 })
      const version = stdout.trim()
      if (version.startsWith('4.')) {
        return { binary, version }
      }
    } catch {
      // binary not runnable, try the next candidate
    }
  }
  return undefined
}

const skipReason = `No Godot 4.x binary was reachable. Tried "$GODOT_BIN" and "godot" on PATH (none found). Install Godot 4.x (or set GODOT_BIN), and install the export templates for ${GODOT_VERSION} (Editor > Manage Export Templates > Install) to run this integration test for real.`

describe('plugin-godot integration', () => {
  test('exports a minimal Godot 4 project for real', async (ctx) => {
    const godot = await findGodot()
    if (!godot) {
      ctx.skip(skipReason)
      return
    }

    const dir = await mkdtemp(join(tmpdir(), 'pipelab-godot-it-'))
    try {
      const projectDir = join(dir, 'project')
      await mkdir(projectDir, { recursive: true })
      await writeFile(
        join(projectDir, 'project.godot'),
        'config_version=5\n\n[application]\n\nconfig/name="Pipelab Godot Integration"\n'
      )
      await writeFile(
        join(projectDir, 'main.tscn'),
        '[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n'
      )
      const outputPath = join(dir, 'godot-export', 'web', 'index.html')
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(
        join(projectDir, 'export_presets.cfg'),
        generatePresetConfig(0, 'Pipelab Web', 'Web', outputPath)
      )

      const result = await execa(
        godot.binary,
        ['--headless', '--export-release', 'Pipelab Web', outputPath],
        {
          cwd: projectDir,
          reject: false,
          timeout: 600_000
        }
      )

      const output = `${result.stdout || ''}\n${result.stderr || ''}`
      if (/template/i.test(output)) {
        ctx.skip(
          `Godot ${godot.version} was found, but the export templates are not installed. Install them for ${GODOT_VERSION} (Editor > Manage Export Templates > Install) to run this integration test for real.`
        )
        return
      }

      expect(result.exitCode).toBe(0)
      expect(output).not.toMatch(/ERROR/i)
      expect(await fileExists(outputPath)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 600_000)
})
