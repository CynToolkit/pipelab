// 1. Critical Migrators - Explicitly imported then exported to satisfy Node.js ESM scanner
import {
  appSettingsMigrator as _appSettingsMigrator,
  defaultAppSettings as _defaultAppSettings,
  fileRepoMigrations as _fileRepoMigrations,
  defaultFileRepo as _defaultFileRepo,
  savedFileMigrator as _savedFileMigrator,
  configRegistry as _configRegistry,
} from "./config/migrators";

export const appSettingsMigrator = _appSettingsMigrator;
export const defaultAppSettings = _defaultAppSettings;
export const fileRepoMigrations = _fileRepoMigrations;
export const defaultFileRepo = _defaultFileRepo;
export const savedFileMigrator = _savedFileMigrator;
export const configRegistry = _configRegistry;

// 2. Types
export type { Migrator } from "./config/migrators";

// 3. Core Library exports (Systematic restoration)
export * from "./apis";
export * from "./build-history";
export * from "./config.schema";
export * from "./database.types";
export * from "./evaluator";
export * from "./fmt";
export * from "./graph";
export * from "./i18n-utils";
export * from "./ipc.types";
export * from "./logger";
export * from "./model";
export * from "./plugins";
export * from "./plugins/definitions"; // <-- RE-ADDED
export * from "./quickjs";
export * from "./save-location";
export * from "./subscription-errors";
export * from "./supabase";
export * from "./types";
export * from "./utils";
export * from "./validation";
export * from "./variables";
export * from "./websocket.types";

// 4. Configuration Sub-packages
export * from "./config/projects-definition"; // <-- RE-ADDED
export * from "./config/settings-definition"; // <-- RE-ADDED
export * from "./config/projects-types";

// NOTE: We avoid "export * from './config'" to prevent nested re-export circles.
// All necessary members from the config subfolder are explicitly exported above.
