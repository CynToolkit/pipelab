import {
  createMigration,
  createMigrator,
  finalVersion,
  initialVersion,
  OmitVersion,
  SemVer,
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

export interface Migrator<T> {
  migrate: (data: any, options?: any) => Promise<T>;
  defaultValue: T;
}

// --- Settings Migrator ---

const settingsMigratorInternal = createMigrator<AppConfigV1, AppConfig>();

export const defaultAppSettings = settingsMigratorInternal.createDefault({
  cacheFolder: "",
  clearTemporaryFoldersOnPipelineEnd: false,
  locale: "en-US",
  theme: "light",
  version: "7.0.0" as SemVer,
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
});

export const appSettingsMigrator = settingsMigratorInternal.createMigrations({
  defaultValue: defaultAppSettings,
  migrations: [
    createMigration<never, AppConfigV1, AppConfigV2>({
      version: "1.0.0" as SemVer,
      up: (state) => state satisfies OmitVersion<AppConfigV2>,
      down: initialVersion,
    }),
    createMigration<AppConfigV1, AppConfigV2, AppConfigV3>({
      version: "2.0.0" as SemVer,
      up: (state) => {
        return {
          ...state,
          clearTemporaryFoldersOnPipelineEnd: false,
        } satisfies OmitVersion<AppConfigV3>;
      },
      down: () => {
        throw new Error("Can't migrate down from 2.0.0");
      },
    }),
    createMigration<AppConfigV2, AppConfigV3, AppConfigV4>({
      version: "3.0.0" as SemVer,
      up: (state) => ({
        ...state,
        locale: "en-US" as const,
      }),
      down: (state) => {
        const { locale, ...rest } = state as AppConfigV4;
        return rest as unknown as AppConfigV3;
      },
    }),
    createMigration<AppConfigV3, AppConfigV4, AppConfigV5>({
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
      down: (state) => {
        const { tours, ...rest } = state as AppConfigV5;
        return rest as unknown as AppConfigV4;
      },
    }),
    createMigration<AppConfigV4, AppConfigV5, AppConfigV6>({
      version: "5.0.0" as SemVer,
      up: (state) => ({
        ...state,
        autosave: true,
      }),
      down: (state) => {
        const { autosave, ...rest } = state as AppConfigV6;
        return rest as unknown as AppConfigV5;
      },
    }),
    createMigration<AppConfigV5, AppConfigV6, AppConfigV7>({
      version: "6.0.0" as SemVer,
      up: (state) => ({
        ...state,
        agents: [],
      }),
      down: (state) => {
        const { agents, ...rest } = state as AppConfigV7;
        return rest as unknown as AppConfigV6;
      },
    }),
    createMigration<AppConfigV6, AppConfigV7, never>({
      version: "7.0.0" as SemVer,
      up: finalVersion,
      down: () => {
        throw new Error("Can't migrate down from 7.0.0");
      },
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
  proxies: [],
});

export const fileRepoMigrations = fileRepoMigratorInternal.createMigrations({
  defaultValue: defaultFileRepo,
  migrations: [
    createMigration<never, FileRepoV1, FileRepoV2>({
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
          version: "2.0.0",
          projects: [
            {
              id: "main",
              name: "Default project",
              description: "The initial default project",
            },
          ],
          pipelines: pipelines,
          proxies: [],
        } as any;
      },
      down: initialVersion,
    }),
    createMigration<FileRepoV1, FileRepoV2, never>({
      version: "2.0.0",
      up: finalVersion,
      down: (state) => {
        throw new Error("Cannot downgrade to version 1.0.0");
      },
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
  version: "4.0.0" as SemVer,
});

export const savedFileMigrator = savedFileMigratorInternal.createMigrations({
  defaultValue: savedFileDefaultValue,
  migrations: [
    createMigration<never, SavedFileV1, SavedFileV2>({
      version: "1.0.0" as SemVer,
      up: (state) => {
        const blocks = state.canvas.blocks;

        const triggers: any[] = [];
        const newBlocks: any[] = [];

        for (const block of blocks) {
          if (block.type === "event") {
            triggers.push(block);
          } else {
            newBlocks.push(block);
          }
        }

        return {
          canvas: {
            blocks: newBlocks,
            triggers: triggers,
          },
          description: state.description,
          name: state.name,
          variables: state.variables,
        } as any;
      },
      down: initialVersion,
    }),
    createMigration<SavedFileV1, SavedFileV2, SavedFileV3>({
      version: "2.0.0" as SemVer,
      up: (state) => {
        const { canvas, ...rest } = state;
        const { blocks, triggers } = canvas;

        const newBlocks: any[] = [];

        for (const block of blocks) {
          const newParams: any = {};

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
          ...rest,
          canvas: {
            triggers,
            blocks: newBlocks,
          },
        } as any;
      },
      down: () => {
        throw new Error("Migration down not implemented");
      },
    }),
    createMigration<SavedFileV2, SavedFileV3, SavedFileV4>({
      version: "3.0.0" as SemVer,
      up: (state) => {
        return {
          ...state,
          type: "default",
        } as any;
      },
      down: () => {
        throw new Error("Migration down not implemented");
      },
    }),
    createMigration<SavedFileV3, SavedFileV4, SavedFileV4>({
      version: "4.0.0" as SemVer,
      up: finalVersion,
      down: () => {
        throw new Error("Migration down not implemented");
      },
    }),
  ],
});

// --- Registry ---

export const configRegistry: Record<string, Migrator<any>> = {
  settings: appSettingsMigrator,
  projects: fileRepoMigrations,
  pipeline: savedFileMigrator,
};
