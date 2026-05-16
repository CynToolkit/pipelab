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
} from "../config.schema";
import { FileRepoV1, FileRepoV2, FileRepo } from "./projects-types";
import { SavedFileV1, SavedFileV2, SavedFileV3, SavedFileV4, SavedFile } from "../model";

// --- Types ---

export type Additive<T, P> = OmitVersion<T> & OmitVersion<P>;

const createMigration = <From extends MigrationSchema, To extends MigrationSchema>(config: {
  version: SemVer;
  up: (state: OmitVersion<From>, targetVersion: string) => Awaitable<Additive<To, From>>;
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
  buildHistory: {
    retentionPolicy: {
      enabled: false,
      maxEntries: 50,
      maxAge: 30,
    },
  },
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
        // Upgrades V6 to V7: Add agents, add buildHistory.
        // (Additive only - keeping cacheFolder and clearTemporaryFoldersOnPipelineEnd)
        return {
          ...state,
          agents: [],
          buildHistory: {
            retentionPolicy: {
              enabled: false,
              maxEntries: 50,
              maxAge: 30,
            },
          },
        };
      },
    }),
    createMigration<AppConfigV7, never>({
      version: "7.0.0" as SemVer,
      up: finalVersion,
    }),
  ],
});

// --- Projects Migrator ---

const fileRepoMigratorInternal = createMigrator<FileRepoV1, FileRepo>();

export const defaultFileRepo = fileRepoMigratorInternal.createDefault({
  version: "2.0.0",
  projects: [
    {
      id: "main",
      name: "Default project",
      description: "The initial default project",
    },
  ],
  pipelines: [],
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
    createMigration<FileRepoV2, never>({
      version: "2.0.0",
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
  type: "default",
  version: "4.0.0",
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
    createMigration<SavedFileV4, never>({
      version: "4.0.0" as SemVer,
      up: finalVersion,
    }),
  ],
});

// --- Registry ---

export const configRegistry: Record<string, Migrator<any>> = {
  settings: appSettingsMigrator,
  projects: fileRepoMigrations,
  pipeline: savedFileMigrator,
};
