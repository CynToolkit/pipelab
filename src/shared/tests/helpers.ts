import { vi } from 'vitest'

export const browserWindow = {
  setProgressBar: vi.fn()
} satisfies Partial<Electron.BrowserWindow> as unknown as Electron.BrowserWindow
