import { createRequire } from "node:module";
import { join } from "node:path";

export const getLocalCliRunner = (
  projectRoot: string | undefined,
  entryPoint: string,
  platform: NodeJS.Platform,
  electronExecutable: string,
  nodeExecutable = process.env.npm_node_execpath || "node.exe",
): { executable: string; args: string[] } => {
  const requireFromDesktop = projectRoot
    ? createRequire(join(projectRoot, "apps", "desktop", "package.json"))
    : undefined;
  const tsxCliPath = requireFromDesktop?.resolve("tsx/cli") ?? "tsx";
  const useDirectNodeLoader = platform === "win32";
  return {
    // Windows Electron does not reliably run as Node for a local TypeScript CLI.
    // Invoke tsx's JavaScript entry point with Node; Electron's Node mode and the
    // loader-only form both fail to reach CLI readiness under the Desktop host.
    executable: useDirectNodeLoader ? nodeExecutable : electronExecutable,
    args: [tsxCliPath, entryPoint, "serve"],
  };
};
