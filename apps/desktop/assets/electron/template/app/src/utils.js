import pkg from '../package.json' with { type: "json" };

/**
 * @param {ElectronAppConfig.Config} config
 */
export const getAppName = (config) => {
  const platform = process.platform

  let appNameFolder = config.name
  if (platform === 'win32') {
    appNameFolder = config.name ?? pkg.productName ?? pkg.name
  } else if (platform === 'darwin') {
    appNameFolder = config.appBundleId
  } else if (platform === 'linux') {
    appNameFolder = config.appBundleId
  }
  return appNameFolder
}
