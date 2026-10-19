import { join } from "node:path";

export const getLocalCliRunnerArgs = (
  projectRoot: string | undefined,
  entryPoint: string,
): string[] => {
  const tsxCliPath = projectRoot
    ? join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
    : "tsx";
  return [tsxCliPath, entryPoint, "serve"];
};
