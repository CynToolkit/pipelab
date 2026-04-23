import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : typeof import.meta !== "undefined" && import.meta.url
      ? dirname(fileURLToPath(import.meta.url))
      : process.cwd();

export const isDev = process.env.NODE_ENV === "development";

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

const getArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index > -1 && index < process.argv.length - 1) {
    return process.argv[index + 1];
  }
  return undefined;
};

/**
 * The path where user data (settings, build history, etc.) is stored.
 * Can be overridden by the --user-data CLI flag or setUserDataPath.
 */
export let userDataPath = getArg("--user-data")
  ? resolve(getArg("--user-data")!)
  : join(homedir(), ".config", "@pipelab", isDev ? "app-dev" : "app");

/**
 * Allows overriding the user data path.
 */
export const setUserDataPath = (path: string) => {
  userDataPath = path;
};

/**
 * The path to the assets directory (contains shims, templates, etc.).
 * Default is calculated relative to the current file, but can be overridden.
 */
export let assetsPath = join(_dirname, "..", "assets");
(global as any).PIPELAB_ASSETS_PATH = assetsPath;

/**
 * Allows overriding the assets path if it's not in the default location.
 */
export const setAssetsPath = (path: string) => {
  assetsPath = path;
  (global as any).PIPELAB_ASSETS_PATH = path;
};
