import { PipelabContext } from "./context";
import path from "node:path";
import { ensure } from "./utils/fs-extras";
import fs from "node:fs/promises";
import {
  useLogger,
  Migrator,
  AppConfig,
  ConnectionsConfig,
  FileRepo,
  SavedFile,
  appSettingsMigrator,
  connectionsMigrator,
  fileRepoMigrations,
  savedFileMigrator,
} from "@pipelab/shared";

export const setupConfigFile = async <T>(
  filesPath: string,
  options: { context: PipelabContext; migrator: Migrator<T> },
) => {
  const ctx = options.context;
  const parsedPath = path.parse(filesPath);
  const migrator = options.migrator;

  await ensure(filesPath, JSON.stringify(migrator.defaultValue));

  return {
    setConfig: async (config: T) => {
      const { logger } = useLogger();
      try {
        await fs.writeFile(filesPath, JSON.stringify(config));
        return true;
      } catch (e) {
        logger().error(`Error saving config ${parsedPath.name}:`, e);
        return false;
      }
    },
    getConfig: async () => {
      const { logger } = useLogger();
      let content = undefined;
      let originalJson: any = undefined;
      let parseFailed = false;

      try {
        content = await fs.readFile(filesPath, "utf8");
        if (content !== undefined) {
          originalJson = JSON.parse(content);
        }
      } catch (e) {
        logger().error(`Error reading or parsing config ${parsedPath.name}:`, e);
        parseFailed = true;
      }

      let json: any = undefined;
      let migrationFailed = false;
      try {
        if (!parseFailed) {
          json = await migrator.migrate(originalJson, {
            debug: false,
            onStep: async (state: any, version: string) => {
              const versionedPath = path.join(
                parsedPath.dir,
                `${parsedPath.name}.v${version}.json`,
              );
              try {
                await fs.writeFile(versionedPath, JSON.stringify(state));
                logger().info(
                  `Intermediate backup created for ${parsedPath.name} at ${versionedPath}`,
                );
              } catch (e) {
                logger().error(
                  `Failed to create intermediate backup for ${parsedPath.name} at v${version}:`,
                  e,
                );
              }
            },
          });
        } else {
          json = migrator.defaultValue;
        }
      } catch (e) {
        logger().error(`Error migrating config ${parsedPath.name}:`, e);
        migrationFailed = true;
        json = migrator.defaultValue;
      }

      const originalVersion = originalJson?.version;
      const newVersion = json?.version;

      const shouldSaveBack =
        originalVersion !== newVersion || content === undefined || parseFailed || migrationFailed;

      if (shouldSaveBack) {
        if (parseFailed || migrationFailed) {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const corruptedPath = path.join(
              parsedPath.dir,
              `${parsedPath.name}.corrupted.${timestamp}.json`,
            );
            const backupContent = parseFailed
              ? content || ""
              : JSON.stringify(originalJson, null, 2);
            await fs.writeFile(corruptedPath, backupContent);
            logger().info(`Corrupted config file preserved at ${corruptedPath}`);
          } catch (e) {
            logger().error(`Failed to backup corrupted config ${parsedPath.name}:`, e);
          }
        }

        try {
          await fs.writeFile(filesPath, JSON.stringify(json));
        } catch (e) {
          logger().error(`Error saving migrated config ${parsedPath.name}:`, e);
        }
      }

      return json as T;
    },
  };
};

export const setupSettingsConfigFile = (context: PipelabContext) => {
  return setupConfigFile<AppConfig>(context.getSettingsPath(), {
    context,
    migrator: appSettingsMigrator,
  });
};

export const setupConnectionsConfigFile = (context: PipelabContext) => {
  return setupConfigFile<ConnectionsConfig>(context.getConnectionsPath(), {
    context,
    migrator: connectionsMigrator,
  });
};

export const setupProjectsConfigFile = (context: PipelabContext) => {
  return setupConfigFile<FileRepo>(context.getProjectsPath(), {
    context,
    migrator: fileRepoMigrations,
  });
};

export const setupPipelineConfigFileByName = (name: string, context: PipelabContext) => {
  const filesPath = context.getConfigPath(`${name}.json`);
  return setupConfigFile<SavedFile>(filesPath, {
    context,
    migrator: savedFileMigrator,
  });
};

export const setupPipelineConfigFileByPath = (absolutePath: string, context: PipelabContext) => {
  return setupConfigFile<SavedFile>(absolutePath, {
    context,
    migrator: savedFileMigrator,
  });
};

const deleteConfigFile = async (filesPath: string) => {
  await fs.rm(filesPath, { force: true });
};

export const deletePipelineConfigFileByName = async (name: string, context: PipelabContext) => {
  const filesPath = context.getConfigPath(`${name}.json`);
  await deleteConfigFile(filesPath);
};

export const deletePipelineConfigFileByPath = async (
  absolutePath: string,
  context: PipelabContext,
) => {
  await deleteConfigFile(absolutePath);
};
