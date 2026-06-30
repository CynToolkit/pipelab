import { join, dirname, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, realpath, mkdtemp } from "node:fs/promises";
import { SandboxFolder, DEFAULT_NODE_VERSION, DEFAULT_PNPM_VERSION } from "@pipelab/constants";

// @ts-ignore import.meta is only allowed in ES Modules
const metaUrl = typeof import.meta !== "undefined" ? import.meta.url : undefined;

const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : metaUrl
      ? dirname(fileURLToPath(metaUrl))
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

export const CacheFolder = {
  Actions: "actions",
  Pipelines: "pipelines",
  Pacote: "pacote",
} as const;

export type CacheFolderType = (typeof CacheFolder)[keyof typeof CacheFolder];

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

  getSettingsPath() {
    return this.getConfigPath("settings.json");
  }

  getConnectionsPath() {
    return this.getConfigPath("connections.json");
  }

  getProjectsPath() {
    return this.getConfigPath("projects.json");
  }

  private _cachedSettings: any = null;
  private _cachedSettingsTime: number = 0;

  private getSettings() {
    const settingsPath = this.getSettingsPath();
    if (!existsSync(settingsPath)) {
      return null;
    }
    const now = Date.now();
    if (this._cachedSettings && now - this._cachedSettingsTime < 2000) {
      return this._cachedSettings;
    }
    try {
      const content = readFileSync(settingsPath, "utf8");
      this._cachedSettings = JSON.parse(content);
      this._cachedSettingsTime = now;
      return this._cachedSettings;
    } catch (e) {
      return this._cachedSettings;
    }
  }

  getTempPath(...subpaths: string[]) {
    const settings = this.getSettings();
    const base = settings?.tempFolder || join(this.userDataPath, "temp");
    return join(base, ...subpaths);
  }

  async createTempFolder(prefix = "pipelab-") {
    const baseDir = this.getTempPath();
    await mkdir(baseDir, { recursive: true });
    const realBaseDir = await realpath(baseDir);
    return await mkdtemp(join(realBaseDir, prefix));
  }

  getCachePath(): string;
  getCachePath(folder: CacheFolderType, ...subpaths: string[]): string;
  getCachePath(folder?: CacheFolderType, ...subpaths: string[]) {
    const settings = this.getSettings();
    const base = settings?.cacheFolder || join(this.userDataPath, "cache");
    if (!folder) {
      return base;
    }
    return join(base, folder, ...subpaths);
  }

  getPnpmPath(...subpaths: string[]) {
    return join(this.userDataPath, "pnpm", ...subpaths);
  }

  getBuildHistoryPath(...subpaths: string[]) {
    return join(this.userDataPath, "build-history", ...subpaths);
  }

  getNodePath(version = DEFAULT_NODE_VERSION) {
    const isWindows = process.platform === "win32";
    return this.getThirdPartyPath("node", version, isWindows ? "node.exe" : "bin/node");
  }

  getPnpmBinPath(version = DEFAULT_PNPM_VERSION) {
    return this.getPackagesPath("pnpm", version, "bin", "pnpm.cjs");
  }

  getSandboxFolders(): Array<{ name: SandboxFolder; label: string; path: string }> {
    const foldersRecord: Record<SandboxFolder, { label: string; path: string }> = {
      [SandboxFolder.Packages]: { label: "Packages", path: this.getPackagesPath() },
      [SandboxFolder.ThirdParty]: { label: "Third-Party Tools", path: this.getThirdPartyPath() },
      [SandboxFolder.Config]: { label: "Configuration", path: this.getConfigPath() },
      [SandboxFolder.Temp]: { label: "Temporary Files", path: this.getTempPath() },
      [SandboxFolder.Cache]: { label: "Cache", path: this.getCachePath() },
      [SandboxFolder.Pnpm]: { label: "PNPM Home", path: this.getPnpmPath() },
    };

    return (Object.keys(foldersRecord) as SandboxFolder[]).map((key) => ({
      name: key,
      ...foldersRecord[key],
    }));
  }
}
