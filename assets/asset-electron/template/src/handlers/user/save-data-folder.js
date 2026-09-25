import path from "node:path";

/**
 * @param {{ platform: NodeJS.Platform, env: NodeJS.ProcessEnv, homePath: string, appDataPath: string, appNameFolder: string, pathUtils?: Pick<typeof path, "isAbsolute" | "join"> }} options
 */
export function resolveSaveDataFolder({
  platform,
  env,
  homePath,
  appDataPath,
  appNameFolder,
  pathUtils = path,
}) {
  let basePath;

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    basePath = localAppData && pathUtils.isAbsolute(localAppData)
      ? localAppData
      : pathUtils.join(homePath, "AppData", "Local");
  } else if (platform === "linux") {
    const xdgDataHome = env.XDG_DATA_HOME;
    basePath = xdgDataHome && pathUtils.isAbsolute(xdgDataHome)
      ? xdgDataHome
      : pathUtils.join(homePath, ".local", "share");
  } else {
    basePath = appDataPath;
  }

  return pathUtils.join(basePath, appNameFolder);
}
