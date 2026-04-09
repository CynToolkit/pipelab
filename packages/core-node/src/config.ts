import { userDataPath } from "./context";
import path from "node:path";
import { ensure } from "@pipelab/plugin-core";
import fs from "node:fs/promises";
import { useLogger } from "@pipelab/shared";
import { configRegistry, Migrator } from "@pipelab/shared";

export const getMigrator = <T>(name: string) => {
  if (configRegistry[name]) {
    return configRegistry[name] as Migrator<T>;
  }

  if (name.startsWith("pipeline-")) {
    return configRegistry["pipeline"] as Migrator<T>;
  }

  return undefined;
};

export const setupConfigFile = async <T>(name: string, customMigrator?: Migrator<T>) => {
  const migrator = customMigrator || getMigrator<T>(name);

  if (!migrator) {
    throw new Error(
      `No migrator found for configuration: ${name}. All managed files must have a migration schema.`,
    );
  }

  const userData = userDataPath;
  const isAbsolutePath = path.isAbsolute(name);
  const filesPath = isAbsolutePath ? name : path.join(userData, "config", `${name}.json`);

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

      try {
        content = await fs.readFile(filesPath, "utf8");
        if (content !== undefined) {
          originalJson = JSON.parse(content);
        }
      } catch (e) {
        logger().error(`Error reading or parsing config ${name}:`, e);
      }

      // console.log("content", content);

      let json: any = undefined;
      try {
        json = await migrator.migrate(originalJson, {
          debug: true,
        });
        console.log("json", json);
      } catch (e) {
        logger().error(`Error migrating config ${name}:`, e);
        json = migrator.defaultValue;
      }

      const originalVersion = originalJson?.version;
      const newVersion = json?.version;

      // Check if migration actually changed the version
      if (originalVersion !== newVersion && content !== undefined) {
        // Backup previous file before overwriting
        const parsedPath = path.parse(filesPath);
        const versionSuffix = originalVersion || "unknown";
        const backupPath = path.join(parsedPath.dir, `${parsedPath.name}.${versionSuffix}.bak`);

        try {
          await fs.copyFile(filesPath, backupPath);
          logger().info(`Backup created for ${name} at ${backupPath} (version ${versionSuffix})`);
        } catch (e) {
          logger().error(`Failed to create backup for ${name}:`, e);
        }
      }

      // Save back migrated config if changed or if it's a new file
      if (originalVersion !== newVersion || content === undefined) {
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
