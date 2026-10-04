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
  { name: "@pipelab/plugin-steam", enabled: true, description: "Steam publishing" },
  { name: "@pipelab/plugin-itch", enabled: true, description: "Itch.io publishing" },
  { name: "@pipelab/plugin-electron", enabled: true, description: "Electron packaging" },
  { name: "@pipelab/plugin-poki", enabled: true, description: "Poki publishing" },
  { name: "@pipelab/plugin-tauri", enabled: true, description: "Tauri packaging" },
];
import { FileRepoV1, FileRepoV2, FileRepoV3, FileRepoV4, FileRepo } from "./projects-types";

// --- Types ---

export type Additive<T, P> = OmitVersion<T> & OmitVersion<P>;

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
  version: "4.0.0",
  projects: [
    {
      id: "main",
      name: "Default project",
      description: "The initial default project",
    },
  ],
  workflows: [],
});

export const fileRepoMigrations = fileRepoMigratorInternal.createMigrations({
  defaultValue: defaultFileRepo,
  migrations: [
    createMigration<FileRepoV1, FileRepoV2>({
      version: "1.0.0",
      up: () => ({
        projects: [
          {
            id: "main",
            name: "Default project",
            description: "The initial default project",
          },
        ],
      }),
    }),
    createMigration<FileRepoV2, FileRepoV3>({
      version: "2.0.0",
      up: (state) => ({ projects: state.projects, workflows: [] }),
    }),
    createMigration<FileRepoV3, FileRepoV4>({
      version: "3.0.0",
      up: (state) => ({
        projects: state.projects,
        workflows: state.workflows || [],
      }),
    }),
    createMigration<FileRepoV4, never>({
      version: "4.0.0",
      up: finalVersion,
    }),
  ],
});

// --- Registry ---

export const configRegistry: Record<string, Migrator<any>> = {
  settings: appSettingsMigrator,
  projects: fileRepoMigrations,
  connections: connectionsMigrator,
};
