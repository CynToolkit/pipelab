import { useAPI } from "../ipc-core";
import { useLogger, configRegistry } from "@pipelab/shared";
import { setupConfigFile, getMigrator } from "../config";
import { PipelabContext } from "../context";
import fs from "node:fs/promises";
import path from "node:path";

export const registerConfigHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("config:load", async (_, { send, value }) => {
    const { config: name } = value;
    logger().info("config:load", name);

    try {
      const manager = await setupConfigFile(name, { context });
      const json = await manager.getConfig();

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            result: json,
          },
        },
      });
    } catch (e) {
      logger().error(`config:load error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to load config ${name}`,
        },
      });
    }
  });

  handle("config:save", async (_, { send, value }) => {
    const { data, config: name } = value;

    try {
      const manager = await setupConfigFile(name, { context });
      const json = typeof data === "string" ? JSON.parse(data) : data;
      await manager.setConfig(json);

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            result: "ok",
          },
        },
      });
    } catch (e) {
      logger().error(`config:save error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to save config ${name}`,
        },
      });
    }
  });

  handle("config:reset", async (event, { value, send }) => {
    const { config: name, key } = value;
    logger().info("config:reset", name, key);

    try {
      const manager = await setupConfigFile(name, { context });
      const currentConfig = await manager.getConfig();

      const migrator = getMigrator(name);

      if (!migrator) {
        throw new Error(`No migrator found for configuration: ${name}`);
      }

      const defaultValue = (migrator.defaultValue as any)[key];

      await manager.setConfig({
        ...(currentConfig ? (currentConfig as any) : {}),
        [key]: defaultValue,
      } as any);

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            result: "ok",
          },
        },
      });
    } catch (e) {
      logger().error(`config:reset error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to reset config ${name}`,
        },
      });
    }
  });

  handle("config:delete", async (_, { send, value }) => {
    const { config: name } = value;
    logger().info("config:delete", name);

    try {
      // Config could be an absolute path (for external files/pipelines)
      // or a name/identifier (for internal config files stored in Pipelab's app data directory).
      const isAbsolutePath = path.isAbsolute(name);
      const filesPath = isAbsolutePath ? name : context.getConfigPath(`${name}.json`);

      await fs.rm(filesPath, { force: true });

      // Clean up versioned backups too
      const parsedPath = path.parse(filesPath);
      const dirEntries = await fs.readdir(parsedPath.dir).catch(() => [] as string[]);
      const prefix = `${parsedPath.name}.v`;
      const suffix = `.json`;
      for (const entry of dirEntries) {
        if (entry.startsWith(prefix) && entry.endsWith(suffix)) {
          const backupPath = path.join(parsedPath.dir, entry);
          await fs.rm(backupPath, { force: true }).catch((err) => {
            logger().error(`Failed to delete backup ${backupPath}:`, err);
          });
        }
      }

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            result: "ok",
          },
        },
      });
    } catch (e) {
      logger().error(`config:delete error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to delete config ${name}`,
        },
      });
    }
  });
};
