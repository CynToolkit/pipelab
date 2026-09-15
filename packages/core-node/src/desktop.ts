import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDefaultUserDataPath, isDev, PipelabContext, projectRoot } from "./context";
import { resolveBundledCli } from "./bundled-cli";

export { getDefaultUserDataPath, PipelabContext, projectRoot } from "./context";
export { fetchLatestDesktopRelease } from "./utils/github";

export async function fetchPipelabCli(
  _versionOrRange: string,
  _options: { context: PipelabContext },
): Promise<{ packageDir: string; entryPoint: string; isLocal: boolean }> {
  if (isDev && projectRoot) {
    const packageDir = join(projectRoot, "apps", "cli");
    const entryPoint = join(packageDir, "src", "index.ts");
    if (existsSync(entryPoint)) {
      return { packageDir, entryPoint, isLocal: true };
    }
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const bundledCli = await resolveBundledCli(resourcesPath);
    if (bundledCli) return bundledCli;
  }

  throw new Error("CLI is not bundled with the desktop application.");
}
