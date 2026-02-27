export const unpackPath = async () => {
  const { join } = await import('path')
  const { app } = await import('electron')
  const _unpackPath =
    !process.env.NODE_ENV || process.env.NODE_ENV === 'production'
      ? app.getAppPath() // Live Mode
      : process.cwd() // Dev Mode

  return join(_unpackPath)
}

export const assetsPath = async () => {
  const { app } = await import('electron')
  const { join } = await import('path')
  const _assetsPath =
    !process.env.NODE_ENV || process.env.NODE_ENV === 'production'
      ? join(app.getAppPath(), '..') // Live Mode
      : process.cwd() // Dev Mode
  return join(_assetsPath, 'assets')
}

export const dirname = async () => {
  const { join } = await import('path')
  const _dirname =
    !process.env.NODE_ENV || process.env.NODE_ENV === 'production'
      ? __dirname // Live Mode
      : __dirname // Dev Mode
  return join(_dirname)
}
