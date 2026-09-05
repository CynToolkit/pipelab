import { expect, test, vi } from 'vitest'

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false
  }
}))

vi.mock('electron', () => {
  const osTmpdir = () =>
    process.platform === 'win32'
      ? process.env.TEMP || process.env.TMP || process.env.TMPDIR || 'C:\\Windows\\Temp'
      : process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'
  return {
    app: {
      isPackaged: false,
      getPath: () => `${osTmpdir()}/pipelab-godot-registration`
    },
    BrowserWindow: class {},
    shell: {},
    session: {},
    ipcMain: {},
    contextBridge: {},
    dialog: {},
    screen: {},
    protocol: {},
    autoUpdater: {}
  }
})

test('registers the godot plugin as a built-in plugin', async () => {
  const { usePlugins } = await import('@@/plugins')
  const plugins = usePlugins()
  await plugins.registerBuiltIn()

  const godot = plugins.plugins.value.find((plugin) => plugin.id === 'godot')
  expect(godot).toBeDefined()
  expect(godot?.name).toBe('Godot')
  expect(godot?.nodes.some((node) => node.node.id === 'godot-export')).toBe(true)
})

test('getFinalPlugins exposes the godot plugin without its runners', async () => {
  const { getFinalPlugins } = await import('@main/utils')
  const { usePlugins } = await import('@@/plugins')
  await usePlugins().registerBuiltIn()

  const finalPlugins = getFinalPlugins()
  const godot = finalPlugins.find((plugin) => plugin.id === 'godot')
  expect(godot).toBeDefined()
  expect(godot?.nodes.some((node) => node.node.id === 'godot-export')).toBe(true)
})
