import {
  createMigration,
  createMigrator,
  finalVersion,
  initialVersion,
  OmitVersion,
  SemVer,
} from "./index";
import {
  AppConfig,
  AppConfigV1,
  AppConfigV2,
  AppConfigV3,
  AppConfigV4,
  AppConfigV5,
  AppConfigV6,
  AppConfigV7,
} from "@pipelab/shared/src/config/settings";

const migrator = createMigrator<AppConfigV1, AppConfig>();

export const defaultAppSettings = migrator.createDefault({
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

export const appSettingsMigrator = migrator.createMigrations({
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
        locale: "en-US" as const, // Default locale for existing users
      }),
      down: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
