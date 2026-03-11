import { getSystemContext } from './context'

export const unpackPath = async () => {
  const { join } = await import('path')
  try {
    const { app } = await import('electron')
    const _unpackPath =
      !process.env.NODE_ENV || process.env.NODE_ENV === 'production'
        ? app.getAppPath() // Live Mode
        : process.cwd() // Dev Mode

    return join(_unpackPath)
  } catch (e) {
    return process.cwd()
  }
}

export const assetsPath = async () => {
  try {
    const context = getSystemContext()
    if (context.assetsPath) {
      return context.assetsPath
    }
  } catch (e) {
    // context not initialized yet
  }

  const { join } = await import('path')
  try {
    const { app } = await import('electron')
    const _assetsPath =
      !process.env.NODE_ENV || process.env.NODE_ENV === 'production'
        ? join(app.getAppPath(), '..') // Live Mode
        : process.cwd() // Dev Mode
    return join(_assetsPath, 'assets')
  } catch (e) {
    return join(process.cwd(), 'assets')
  }
}

export const dirname = async () => {
  const { join } = await import('path')
  const _dirname =
    !process.env.NODE_ENV || process.env.NODE_ENV === 'production'
      ? __dirname // Live Mode
      : __dirname // Dev Mode
  return join(_dirname)
}
