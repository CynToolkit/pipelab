import { PipelabContext } from "./context";
import path from "node:path";
import { ensure } from "./utils/fs-extras";
import fs from "node:fs/promises";
import { useLogger } from "@pipelab/shared";
import { configRegistry, Migrator } from "@pipelab/shared";

export const getMigrator = <T>(name: string) => {
  return (configRegistry[name] || configRegistry["pipeline"]) as Migrator<T>;
};

export const setupConfigFile = async <T>(
  name: string,
  options: { context: PipelabContext; migrator?: Migrator<T> },
) => {
  const ctx = options.context;
  const migrator = options.migrator || getMigrator<T>(name);

  if (!migrator) {
    throw new Error(
      `No migrator found for configuration: ${name}. All managed files must have a migration schema.`,
    );
  }

  const isAbsolutePath = path.isAbsolute(name);
  const filesPath = isAbsolutePath ? name : ctx.getConfigPath(`${name}.json`);

  await ensure(filesPath, JSON.stringify(migrator.defaultValue));

  return {
    setConfig: async (config: T) => {
      const { logger } = useLogger();
      try {
        await fs.writeFile(filesPath, JSON.stringify(config));
        return true;
      } catch (e) {
        logger().error(`Error saving config ${name}:`, e);
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
        logger().error(`Error reading or parsing config ${name}:`, e);
        parseFailed = true;
      }

      let json: any = undefined;
      let migrationFailed = false;
      try {
        if (!parseFailed) {
          json = await migrator.migrate(originalJson, {
            debug: false,
            onStep: async (state: any, version: string) => {
              const parsedPath = path.parse(filesPath);
              const versionedPath = ctx.getConfigPath(`${parsedPath.name}.v${version}.json`);
              try {
                await fs.writeFile(versionedPath, JSON.stringify(state));
                logger().info(`Intermediate backup created for ${name} at ${versionedPath}`);
              } catch (e) {
                logger().error(
                  `Failed to create intermediate backup for ${name} at v${version}:`,
                  e,
                );
              }
            },
          });
        } else {
          json = migrator.defaultValue;
        }
      } catch (e) {
        logger().error(`Error migrating config ${name}:`, e);
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
            const parsedPath = path.parse(filesPath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const corruptedPath = ctx.getConfigPath(
              `${parsedPath.name}.corrupted.${timestamp}.json`,
            );
            const backupContent = parseFailed
              ? content || ""
              : JSON.stringify(originalJson, null, 2);
            await fs.writeFile(corruptedPath, backupContent);
            logger().info(`Corrupted config file preserved at ${corruptedPath}`);
          } catch (e) {
            logger().error(`Failed to backup corrupted config ${name}:`, e);
          }
        }

        try {
          await fs.writeFile(filesPath, JSON.stringify(json));
        } catch (e) {
          logger().error(`Error saving migrated config ${name}:`, e);
        }
      }

      return json as T;
    },
  };
};

export const deleteConfigFile = async (nameOrPath: string, context: PipelabContext) => {
  const isAbsolutePath = path.isAbsolute(nameOrPath);
  const filesPath = isAbsolutePath ? nameOrPath : context.getConfigPath(`${nameOrPath}.json`);

  await fs.rm(filesPath, { force: true });
};
