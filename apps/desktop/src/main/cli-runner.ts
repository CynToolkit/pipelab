import { createRequire } from "node:module";
import { join } from "node:path";

export const getLocalCliRunner = (
  projectRoot: string | undefined,
  entryPoint: string,
  platform: NodeJS.Platform,
  electronExecutable: string,
): { executable: string; args: string[] } => {
  const tsxCliPath = projectRoot
    ? createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx/cli")
    : "tsx";
  return {
    // Windows Electron does not reliably run as Node for a local TypeScript CLI.
    // Development mode already requires Node, so use the system runtime there.
    executable: platform === "win32" ? "node.exe" : electronExecutable,
    args: [tsxCliPath, entryPoint, "serve"],
  };
};
