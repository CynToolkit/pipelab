import { useAPI, WsEvent } from "../ipc-core";
import { useLogger } from "@pipelab/shared";
import { buildHistoryStorage } from "./build-history";
import { SubscriptionRequiredError } from "@pipelab/shared";

// Helper function to check build history authorization
const checkBuildHistoryAuthorization = async (event: WsEvent): Promise<boolean> => {
  const { logger } = useLogger();
  logger().info("AUTH BYPASS: Skipping auth verification for build history access");

  // Always authorize for now - relying on frontend auth checks only
  const isAuthorized = true;

  if (!isAuthorized) {
    throw new SubscriptionRequiredError("build-history");
  }

  return true;
};

export const registerHistoryHandlers = () => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  // Build History Handlers
  handle("build-history:save", async (event, { send, value }) => {
    try {
      // Check authorization before allowing save
      logger().info("AUTH BYPASS: Processing build-history:save request");
      await checkBuildHistoryAuthorization(event);

      await buildHistoryStorage.save(value.entry);
      send({
        type: "end",
        data: {
          type: "success",
          result: { result: "ok" },
        },
      });
    } catch (error) {
      logger().error("Failed to save build history entry:", error);

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: {
            type: "error",
            ipcError: error.userMessage,
            code: error.code,
          },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to save build history entry",
        },
      });
    }
  });

  handle("build-history:get", async (event, { send, value }) => {
    try {
      // Check authorization before allowing access
      logger().info("AUTH BYPASS: Processing build-history:get request");
      await checkBuildHistoryAuthorization(event);

      const entry = await buildHistoryStorage.get(value.id, value.pipelineId);
      send({
        type: "end",
        data: {
          type: "success",
          result: { entry },
        },
      });
    } catch (error) {
      logger().error("Failed to get build history entry:", error);

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: {
            type: "error",
            ipcError: error.userMessage,
            code: error.code,
          },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to get build history entry",
        },
      });
    }
  });

  handle("build-history:get-all", async (event, { send, value }) => {
    try {
      // Check authorization before allowing access
      logger().info("AUTH BYPASS: Processing build-history:get-all request");
      await checkBuildHistoryAuthorization(event);

      // Simplified: get all entries, optionally filter by pipeline
      const allEntries = await buildHistoryStorage.getAll();
      const filteredEntries = value?.query?.pipelineId
        ? allEntries.filter((entry) => entry.pipelineId === value?.query?.pipelineId)
        : allEntries;

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            entries: filteredEntries,
            total: filteredEntries.length,
          },
        },
      });
    } catch (error) {
      logger().error("Failed to get build history entries:", error);

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: {
            type: "error",
            ipcError: error.userMessage,
            code: error.code,
          },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to get build history entries",
        },
      });
    }
  });

  handle("build-history:update", async (event, { send, value }) => {
    try {
      // Check authorization before allowing update
      await checkBuildHistoryAuthorization(event);

      await buildHistoryStorage.update(value.id, value.updates, value.pipelineId);
      send({
        type: "end",
        data: {
          type: "success",
          result: { result: "ok" },
        },
      });
    } catch (error) {
      logger().error("Failed to update build history entry:", error);

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: {
            type: "error",
            ipcError: error.userMessage,
            code: error.code,
          },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to update build history entry",
        },
      });
    }
  });

  handle("build-history:delete", async (event, { send, value }) => {
    try {
      // Check authorization before allowing deletion
      await checkBuildHistoryAuthorization(event);

      await buildHistoryStorage.delete(value.id, value.pipelineId);
      send({
        type: "end",
        data: {
          type: "success",
          result: { result: "ok" },
        },
      });
    } catch (error) {
      logger().error("Failed to delete build history entry:", error);

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: {
            type: "error",
            ipcError: error.userMessage,
            code: error.code,
          },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to delete build history entry",
        },
      });
    }
  });

  handle("build-history:clear", async (event, { send }) => {
    try {
      // Check authorization before allowing clear operation
      await checkBuildHistoryAuthorization(event);

      await buildHistoryStorage.clear();
      send({
        type: "end",
        data: {
          type: "success",
          result: { result: "ok" },
        },
      });
    } catch (error) {
      logger().error("Failed to clear build history:", error);

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: {
            type: "error",
            ipcError: error.userMessage,
            code: error.code,
          },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to clear build history",
        },
      });
    }
  });

  handle("build-history:get-storage-info", async (event, { send }) => {
    try {
      // Check authorization before allowing access to storage info
      await checkBuildHistoryAuthorization(event);

      const info = await buildHistoryStorage.getStorageInfo();
      send({
        type: "end",
        data: {
          type: "success",
          result: info,
        },
      });
    } catch (error) {
      logger().error("Failed to get build history storage info:", error);

      // Handle subscription errors with user-friendly messages
      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: {
            type: "error",
            ipcError: error.userMessage,
            code: error.code,
          },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError:
            error instanceof Error ? error.message : "Failed to get build history storage info",
        },
      });
    }
  });

  handle("build-history:configure", async (_, { send, value }) => {
    try {
      // For now, we'll just log the configuration request
      // In a real implementation, you might want to make the storage configurable
      logger().info("Build history configuration request:", value.config);

      send({
        type: "end",
        data: {
          type: "success",
          result: { result: "ok" },
        },
      });
    } catch (error) {
      logger().error("Failed to configure build history:", error);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to configure build history",
        },
      });
    }
  });
};
