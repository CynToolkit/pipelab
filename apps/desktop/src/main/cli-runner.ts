import { createRequire } from "node:module";
import { join } from "node:path";

export const getLocalCliRunner = (
  projectRoot: string | undefined,
  entryPoint: string,
  platform: NodeJS.Platform,
  electronExecutable: string,
): { executable: string; args: string[] } => {
  const requireFromDesktop = projectRoot
    ? createRequire(join(projectRoot, "apps", "desktop", "package.json"))
    : undefined;
  const tsxCliPath = requireFromDesktop?.resolve("tsx/cli") ?? "tsx";
  const tsxLoaderPath = requireFromDesktop?.resolve("tsx") ?? "tsx";
  const useDirectNodeLoader = platform === "win32";
  return {
    // Windows Electron does not reliably run as Node for a local TypeScript CLI.
    // Use Node's loader directly there to avoid tsx/cli spawning another process.
    executable: useDirectNodeLoader ? "node.exe" : electronExecutable,
    args: useDirectNodeLoader
      ? ["--import", tsxLoaderPath, entryPoint, "serve"]
      : [tsxCliPath, entryPoint, "serve"],
  };
};
