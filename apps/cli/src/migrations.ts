import { useAPI, setupConfigFile } from "@pipelab/core-node";
import {
  savedFileMigrator,
  fileRepoMigrations,
  appSettingsMigrator,
  useLogger,
} from "@pipelab/shared";

/**
 * Registers migration handlers for the CLI/Standalone server.
 * This overrides the default handlers from @pipelab/core-node to include
 * pipeline and file repo migrations directly in the backend.
 */
export const registerMigrationHandlers = () => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("config:load", async (_, { send, value }) => {
    const { config: name } = value;
    logger().info("[CLI Migration] config:load", name);

    try {
      // Determine which migrator to use
      let migrator: any = null;
      if (name === "projects") {
        migrator = fileRepoMigrations;
      } else if (name === "settings") {
        migrator = appSettingsMigrator;
      } else if (name.startsWith("pipeline-") || name.endsWith(".plb")) {
        migrator = savedFileMigrator;
      }

      if (!migrator) {
        throw new Error(
          `No migrator found for configuration: ${name}. All files loaded via config:load MUST have a migration schema.`,
        );
      }

      // We use a custom loading logic that applies the migrator
      // Since setupConfigFile in core-node expects the migrator to be in the configRegistry,
      // and we want to keep migrations in the CLI package, we'll manually apply them here.

      const manager = await setupConfigFile(name, migrator);
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
      logger().error(`[CLI Migration] config:load error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to load config ${name}`,
        },
      });
    }
  });

  // We also need to override config:save if we want to ensure consistency,
  // although mostly we just care about migrations on load.
  // The default config:save from core-node will work fine as it uses the same setupConfigFile logic.
};
