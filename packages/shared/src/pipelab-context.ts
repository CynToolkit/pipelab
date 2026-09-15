import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, realpath, mkdtemp } from "node:fs/promises";
import { SandboxFolder, DEFAULT_NODE_VERSION, DEFAULT_PNPM_VERSION } from "@pipelab/constants";

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
type Join<T extends string[], D extends string> = T extends []
  ? ""
  : T extends [infer F extends string]
    ? F
    : T extends [infer F extends string, ...infer R extends string[]]
      ? `${F}${D}${Join<R, D>}`
      : string;

export class PipelabContext {
  public readonly userDataPath: string;
  public readonly releaseTag: string;
  constructor(options: PipelabContextOptions) {
    this.userDataPath = options.userDataPath;
    this.releaseTag = options.releaseTag || "latest";
  }
  getPackagesPath<S extends string[]>(...subpaths: S): `PACKAGES/${Join<S, "/">}`;
  getPackagesPath(...subpaths: string[]): string {
    return join(this.userDataPath, "packages", ...subpaths);
  }
  getThirdPartyPath<S extends string[]>(...subpaths: S): `THIRDPARTY/${Join<S, "/">}`;
  getThirdPartyPath(...subpaths: string[]): string {
    return join(this.userDataPath, "thirdparty", ...subpaths);
  }
  getConfigPath<S extends string[]>(...subpaths: S): `CONFIG/${Join<S, "/">}`;
  getConfigPath(...subpaths: string[]): string {
    return join(this.userDataPath, "config", ...subpaths);
  }
  getSettingsPath(): `CONFIG/settings.json` {
    return this.getConfigPath("settings.json");
  }
  getConnectionsPath(): `CONFIG/connections.json` {
    return this.getConfigPath("connections.json");
  }
  getProjectsPath(): `CONFIG/projects.json` {
    return this.getConfigPath("projects.json");
  }
  private _cachedSettings: any = null;
  private _cachedSettingsTime = 0;
  private getSettings() {
    const settingsPath = this.getSettingsPath();
    if (!existsSync(settingsPath)) return null;
    const now = Date.now();
    if (this._cachedSettings && now - this._cachedSettingsTime < 2000) return this._cachedSettings;
    try {
      this._cachedSettings = JSON.parse(readFileSync(settingsPath, "utf8"));
      this._cachedSettingsTime = now;
      return this._cachedSettings;
    } catch {
      return this._cachedSettings;
    }
  }
  getTempPath<S extends string[]>(...subpaths: S): `TEMP/${Join<S, "/">}`;
  getTempPath(...subpaths: string[]): string {
    const settings = this.getSettings();
    return join(settings?.tempFolder || join(this.userDataPath, "temp"), ...subpaths);
  }
  createTempFolder<T extends string = "pipelab-">(prefix?: T): Promise<`TEMP/${T}${string}`>;
  async createTempFolder(prefix = "pipelab-"): Promise<string> {
    const baseDir = this.getTempPath();
    await mkdir(baseDir, { recursive: true });
    return mkdtemp(join(await realpath(baseDir), prefix));
  }
  getCachePath(): `CACHE/`;
  getCachePath<F extends CacheFolderType, S extends string[]>(
    folder: F,
    ...subpaths: S
  ): `CACHE/${F}/${Join<S, "/">}`;
  getCachePath(folder?: CacheFolderType, ...subpaths: string[]): string {
    const settings = this.getSettings();
    const base = settings?.cacheFolder || join(this.userDataPath, "cache");
    return folder ? join(base, folder, ...subpaths) : base;
  }
  getPnpmPath<S extends string[]>(...subpaths: S): `PNPM/${Join<S, "/">}`;
  getPnpmPath(...subpaths: string[]): string {
    return join(this.userDataPath, "pnpm", ...subpaths);
  }
  getBuildHistoryPath<S extends string[]>(...subpaths: S): `BUILD_HISTORY/${Join<S, "/">}`;
  getBuildHistoryPath(...subpaths: string[]): string {
    return join(this.userDataPath, "build-history", ...subpaths);
  }
  getArtifactsPath<S extends string[]>(...subpaths: S): `ARTIFACTS/${Join<S, "/">}`;
  getArtifactsPath(...subpaths: string[]): string {
    return join(this.userDataPath, "artifacts", ...subpaths);
  }
  getNodePath<V extends string = typeof DEFAULT_NODE_VERSION>(
    version?: V,
  ): `THIRDPARTY/node/${V}/${string}`;
  getNodePath(version = DEFAULT_NODE_VERSION): string {
    return this.getThirdPartyPath(
      "node",
      version,
      process.platform === "win32" ? "node.exe" : "bin/node",
    );
  }
  getPnpmBinPath<V extends string = typeof DEFAULT_PNPM_VERSION>(
    version?: V,
  ): `PACKAGES/pnpm/${V}/bin/pnpm.cjs`;
  getPnpmBinPath(version = DEFAULT_PNPM_VERSION): string {
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
      [SandboxFolder.Artifacts]: { label: "Artifacts", path: this.getArtifactsPath() },
    };
    return (Object.keys(foldersRecord) as SandboxFolder[]).map((key) => ({
      name: key,
      ...foldersRecord[key],
    }));
  }
}
