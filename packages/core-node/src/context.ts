import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

let _dirname = "";
try {
  _dirname = dirname(fileURLToPath(import.meta.url));
} catch (e) {
  _dirname = __dirname;
}

export const isDev = process.env.NODE_ENV === "development";

const getArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index > -1 && index < process.argv.length - 1) {
    return process.argv[index + 1];
  }
  return undefined;
};

/**
 * The path where user data (settings, build history, etc.) is stored.
 * Can be overridden by the --user-data CLI flag.
 */
export const userDataPath =
  (getArg("--user-data") ? resolve(getArg("--user-data")!) : join(homedir(), ".config", "@pipelab", isDev ? "app-dev" : "app"));

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
