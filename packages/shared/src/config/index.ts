import { appSettingsMigrator } from "./settings";
import { fileRepoMigrations } from "./projects";

export * from "./settings";
export * from "./projects";

export interface Migrator<T> {
  migrate: (data: any, options?: any) => Promise<T>;
  defaultValue: T;
}

export const configRegistry: Record<string, Migrator<any>> = {
  settings: appSettingsMigrator,
  projects: fileRepoMigrations,
};
