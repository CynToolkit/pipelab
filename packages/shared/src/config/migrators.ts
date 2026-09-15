import {
  createMigration as createMigrationBase,
  createMigrator,
  finalVersion,
  OmitVersion,
  SemVer,
  Awaitable,
  MigrationSchema,
} from "@pipelab/migration";
import {
  AppConfig,
  AppConfigV1,
  AppConfigV2,
  AppConfigV3,
  AppConfigV4,
  AppConfigV5,
  AppConfigV6,
  AppConfigV7,
  ConnectionsConfig,
  ConnectionsConfigV1,
} from "../config.schema";

const DEFAULT_PLUGINS: AppConfig["plugins"] = [
  {
    name: "@pipelab/plugin-construct",
    enabled: true,
    description: "Construct 3 export & packaging",
  },
  { name: "@pipelab/plugin-filesystem", enabled: true, description: "Filesystem utilities" },
  { name: "@pipelab/plugin-system", enabled: true, description: "System & shell commands" },
  { name: "@pipelab/plugin-steam", enabled: true, description: "Steam publishing" },
  { name: "@pipelab/plugin-itch", enabled: true, description: "Itch.io publishing" },
  { name: "@pipelab/plugin-electron", enabled: true, description: "Electron packaging" },
  { name: "@pipelab/plugin-discord", enabled: true, description: "Discord Rich Presence" },
  { name: "@pipelab/plugin-poki", enabled: true, description: "Poki publishing" },
  { name: "@pipelab/plugin-nvpatch", enabled: true, description: "NW.js patching" },
  { name: "@pipelab/plugin-tauri", enabled: true, description: "Tauri packaging" },
  { name: "@pipelab/plugin-minify", enabled: true, description: "Asset minification" },
  { name: "@pipelab/plugin-netlify", enabled: true, description: "Netlify deployment" },
];
import { FileRepoV1, FileRepoV2, FileRepoV3, FileRepo } from "./projects-types";
import {
  SavedFileV1,
  SavedFileV2,
  SavedFileV3,
  SavedFileV4,
  SavedFileV5,
  SavedFileV6,
  SavedFile,
} from "../model";

// --- Types ---

export type Additive<T, P> = OmitVersion<T> & OmitVersion<P>;

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
type DistributiveOmitVersion<T> = DistributiveOmit<T, keyof MigrationSchema>;

const createMigration = <From extends MigrationSchema, To extends MigrationSchema>(config: {
  version: SemVer;
  up: (state: OmitVersion<From>, targetVersion: string) => Awaitable<OmitVersion<To>>;
}) => createMigrationBase<From, To>(config);

export interface Migrator<T> {
  migrate: (data: any, options?: any) => Promise<T>;
  defaultValue: T;
}

// --- Settings Migrator ---

const settingsMigratorInternal = createMigrator<AppConfigV1, AppConfig>();

export const defaultAppSettings = settingsMigratorInternal.createDefault({
  locale: "en-US",
  theme: "light",
  version: "7.0.0",
  autosave: true,
  agents: [],
  tours: {
    dashboard: {
      step: 0,
      completed: false,
    },
    editor: {
      step: 0,
      completed: false,
    },
  },
  plugins: DEFAULT_PLUGINS,
});

export const appSettingsMigrator = settingsMigratorInternal.createMigrations({
  defaultValue: defaultAppSettings,
  migrations: [
    createMigration<AppConfigV1, AppConfigV2>({
      version: "1.0.0" as SemVer,
      up: (state) => state,
    }),
    createMigration<AppConfigV2, AppConfigV3>({
      version: "2.0.0" as SemVer,
      up: (state) => {
        return {
          ...state,
          clearTemporaryFoldersOnPipelineEnd: false,
        };
      },
    }),
    createMigration<AppConfigV3, AppConfigV4>({
      version: "3.0.0" as SemVer,
      up: (state) => ({
        ...state,
        locale: "en-US" as const,
      }),
    }),
    createMigration<AppConfigV4, AppConfigV5>({
      version: "4.0.0" as SemVer,
      up: (state) => ({
        ...state,
        tours: {
          dashboard: {
            step: 0,
            completed: false,
          },
          editor: {
            step: 0,
            completed: false,
          },
        },
      }),
    }),
    createMigration<AppConfigV5, AppConfigV6>({
      version: "5.0.0" as SemVer,
      up: (state) => ({
        ...state,
        autosave: true,
      }),
    }),
    createMigration<AppConfigV6, AppConfigV7>({
      version: "6.0.0" as SemVer,
      up: (state) => {
        const { cacheFolder, clearTemporaryFoldersOnPipelineEnd: __, ...rest } = state;
        return {
          ...rest,
          cacheFolder,
          agents: [],
          plugins: DEFAULT_PLUGINS,
        };
      },
    }),
    createMigration<AppConfigV7, never>({
      version: "7.0.0" as SemVer,
      up: finalVersion,
    }),
  ],
});

// --- Connections Migrator ---

const connectionsMigratorInternal = createMigrator<ConnectionsConfigV1, ConnectionsConfig>();

export const defaultConnections = connectionsMigratorInternal.createDefault({
  version: "1.0.0",
  connections: [],
});

export const connectionsMigrator = connectionsMigratorInternal.createMigrations({
  defaultValue: defaultConnections,
  migrations: [
    createMigration<ConnectionsConfigV1, never>({
      version: "1.0.0" as SemVer,
      up: finalVersion,
    }),
  ],
});

// --- Projects Migrator ---

const fileRepoMigratorInternal = createMigrator<FileRepoV1, FileRepo>();

export const defaultFileRepo = fileRepoMigratorInternal.createDefault({
  version: "3.0.0",
  projects: [
    {
      id: "main",
      name: "Default project",
      description: "The initial default project",
    },
  ],
  pipelines: [],
  releaseFlows: [],
});

export const fileRepoMigrations = fileRepoMigratorInternal.createMigrations({
  defaultValue: defaultFileRepo,
  migrations: [
    createMigration<FileRepoV1, FileRepoV2>({
      version: "1.0.0",
      up: (state) => {
        const pipelines: FileRepoV2["pipelines"] = Object.entries(state.data || {}).map(
          ([id, file]) => {
            return {
              ...file,
              id,
              project: "main",
            };
          },
        );
        return {
          ...state,
          projects: [
            {
              id: "main",
              name: "Default project",
              description: "The initial default project",
            },
          ],
          pipelines: pipelines,
        };
      },
    }),
    createMigration<FileRepoV2, FileRepoV3>({
      version: "2.0.0",
      up: (state) => {
        return {
          ...state,
          releaseFlows: [],
        };
      },
    }),
    createMigration<FileRepoV3, never>({
      version: "3.0.0",
      up: finalVersion,
    }),
  ],
});

// --- Saved File Migrator ---

const savedFileMigratorInternal = createMigrator<SavedFileV1, SavedFile>();
const savedFileDefaultValue = savedFileMigratorInternal.createDefault({
  canvas: {
    triggers: [],
    blocks: [],
  },
  description: "",
  name: "",
  variables: [],
  version: "6.0.0",
});

export const savedFileMigrator = savedFileMigratorInternal.createMigrations({
  defaultValue: savedFileDefaultValue,
  migrations: [
    createMigration<SavedFileV1, SavedFileV2>({
      version: "1.0.0" as SemVer,
      up: (state) => {
        const blocks = state.canvas.blocks;

        const triggers: SavedFileV2["canvas"]["triggers"] = [];
        const newBlocks: SavedFileV2["canvas"]["blocks"] = [];

        for (const block of blocks) {
          if (block.type === "event") {
            triggers.push(block);
          } else {
            newBlocks.push(block);
          }
        }

        return {
          ...state,
          canvas: {
            ...state.canvas,
            blocks: newBlocks,
            triggers: triggers,
          },
        };
      },
    }),
    createMigration<SavedFileV2, SavedFileV3>({
      version: "2.0.0" as SemVer,
      up: (state) => {
        const { canvas } = state;
        const { blocks, triggers } = canvas;

        const newBlocks: SavedFileV3["canvas"]["blocks"] = [];

        for (const block of blocks) {
          const newParams: SavedFileV3["canvas"]["blocks"][number]["params"] = {};

          for (const data of Object.entries(block.params)) {
            if (data === undefined) {
              throw new Error("Can't migrate block with undefined params");
            } else {
              const [key, value] = data;
              newParams[key] = {
                editor: "editor",
                value,
              };
            }
          }

          newBlocks.push({
            ...block,
            params: newParams,
          });
        }

        return {
          ...state,
          canvas: {
            ...canvas,
            triggers,
            blocks: newBlocks,
          },
        };
      },
    }),
    createMigration<SavedFileV3, SavedFileV4>({
      version: "3.0.0" as SemVer,
      up: (state) => ({
        ...state,
        type: "default",
      }),
    }),
    createMigration<SavedFileV4, SavedFileV5>({
      version: "4.0.0" as SemVer,
      up: (_state) => {
        const state = _state as DistributiveOmitVersion<SavedFileV4>;
        if (state.type === "simple") {
          return {
            name: state.name,
            description: state.description,
            canvas: {
              blocks: [],
              triggers: [],
            },
            variables: [],
          };
        }

        const migrateBlock = (block: any, pluginsMap: Record<string, string>) => {
          if (!block) return;
          if (block.origin?.pluginId) {
            block.origin.pluginId = getStrictPluginId(block.origin.pluginId);
            // Stamp the version from the old top-level plugins map, falling back to "latest"
            block.origin.version = pluginsMap[block.origin.pluginId] ?? "latest";
          }
        };

        // Normalise the old plugins map's keys first so lookups are consistent
        const normalizedPlugins: Record<string, string> = {};
        if (state.plugins) {
          for (const [key, val] of Object.entries(state.plugins)) {
            normalizedPlugins[getStrictPluginId(key)] = val;
          }
        }

        // Stamp origin.version on every block and trigger
        if (state.canvas) {
          for (const block of state.canvas.blocks ?? []) {
            migrateBlock(block, normalizedPlugins);
          }
          for (const trigger of state.canvas.triggers ?? []) {
            migrateBlock(trigger, normalizedPlugins);
          }
        }

        // Drop the top-level plugins map — version is now per-block. Omit type.
        const { plugins: _dropped, type: _type, ...rest } = state;
        return rest;
      },
    }),
    createMigration<SavedFileV5, SavedFileV6>({
      version: "5.0.0" as SemVer,
      up: (_state) => {
        // Runtime data at 5.0.0 still carries versions (V4→V5 stamped them),
        // but the V5 types no longer declare them — hence the loose cast.
        const state = _state as OmitVersion<SavedFileV5> & {
          plugins?: unknown;
          canvas?: { blocks?: any[]; triggers?: any[] };
        };
        // Bundled mode has no plugin versions: strip origin.version from every
        // block and trigger, and drop the legacy top-level plugins map if present.
        for (const item of [
          ...(state.canvas?.blocks ?? []),
          ...(state.canvas?.triggers ?? []),
        ]) {
          delete item?.origin?.version;
        }
        const { plugins: _dropped, ...rest } = state;
        return rest;
      },
    }),
    createMigration<SavedFileV6, never>({
      version: "6.0.0" as SemVer,
      up: finalVersion,
    }),
  ],
});

const LEGACY_ID_MAP: Record<string, string> = {
  construct: "@pipelab/plugin-construct",
  filesystem: "@pipelab/plugin-filesystem",
  system: "@pipelab/plugin-system",
  steam: "@pipelab/plugin-steam",
  itch: "@pipelab/plugin-itch",
  electron: "@pipelab/plugin-electron",
  discord: "@pipelab/plugin-discord",
  dicord: "@pipelab/plugin-discord",
  "@pipelab/plugin-dicord": "@pipelab/plugin-discord",
  poki: "@pipelab/plugin-poki",
  nvpatch: "@pipelab/plugin-nvpatch",
  tauri: "@pipelab/plugin-tauri",
  minify: "@pipelab/plugin-minify",
  netlify: "@pipelab/plugin-netlify",
};

export const getStrictPluginId = (pluginId: string): string => {
  if (!pluginId) return pluginId;
  return LEGACY_ID_MAP[pluginId] || pluginId;
};

const normalizeBlockPluginId = (block: any): boolean => {
  if (!block) return false;
  let changed = false;
  if (block.origin?.pluginId) {
    const strictId = getStrictPluginId(block.origin.pluginId);
    if (block.origin.pluginId !== strictId) {
      block.origin.pluginId = strictId;
      changed = true;
    }
  }
  return changed;
};

export const normalizePipelineConfig = (state: any): boolean => {
  if (!state) return false;
  let changed = false;

  // Normalise plugin IDs in block and trigger origins (pluginId field only;
  // version strings don't need normalisation)
  if (state.canvas) {
    if (Array.isArray(state.canvas.blocks)) {
      for (const block of state.canvas.blocks) {
        if (normalizeBlockPluginId(block)) changed = true;
      }
    }
    if (Array.isArray(state.canvas.triggers)) {
      for (const trigger of state.canvas.triggers) {
        if (normalizeBlockPluginId(trigger)) changed = true;
      }
    }
  }

  return changed;
};

// --- Registry ---

export const configRegistry: Record<string, Migrator<any>> = {
  settings: appSettingsMigrator,
  projects: fileRepoMigrations,
  pipeline: savedFileMigrator,
  connections: connectionsMigrator,
};
