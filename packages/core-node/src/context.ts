import { join, dirname, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : typeof import.meta !== "undefined" && import.meta.url
      ? dirname(fileURLToPath(import.meta.url))
      : process.cwd();

export const isDev = process.env.NODE_ENV === "development";

export const getDefaultUserDataPath = (env?: "dev" | "beta" | "prod") => {
  const base = (() => {
    switch (platform()) {
      case "win32":
        return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
      case "darwin":
        return join(homedir(), "Library", "Application Support");
      default:
        return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    }
  })();

  const mode = env ?? (isDev ? "dev" : "prod");
  const folder = mode === "dev" ? "app-dev" : mode === "beta" ? "app-beta" : "app";

  return join(base, "@pipelab", folder);
};

/**
 * Finds the monorepo root by looking for pnpm-workspace.yaml.
 */
function findProjectRoot(startDir: string): string | null {
  let curr = startDir;
  while (curr !== dirname(curr)) {
    if (existsSync(join(curr, "pnpm-workspace.yaml"))) {
      return curr;
    }
    curr = dirname(curr);
  }
  return null;
}

export const projectRoot = findProjectRoot(_dirname);

export interface PipelabContextOptions {
  userDataPath: string;
  releaseTag?: string;
}

export class PipelabContext {
  public readonly userDataPath: string;
  public readonly releaseTag: string;

  constructor(options: PipelabContextOptions) {
    this.userDataPath = options.userDataPath;
    this.releaseTag = options.releaseTag || "latest";
  }

  getPackagesPath(...subpaths: string[]) {
    return join(this.userDataPath, "packages", ...subpaths);
  }

  getThirdPartyPath(...subpaths: string[]) {
    return join(this.userDataPath, "thirdparty", ...subpaths);
  }

  getConfigPath(...subpaths: string[]) {
    return join(this.userDataPath, "config", ...subpaths);
  }
}
