import { createRequire } from "node:module";
import { join } from "node:path";

export const getLocalCliRunnerArgs = (
  projectRoot: string | undefined,
  entryPoint: string,
): string[] => {
  const tsxCliPath = projectRoot
    ? createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx/cli")
    : "tsx";
  return [tsxCliPath, entryPoint, "serve"];
};
