import { useAPI } from "../ipc-core";
import { useLogger, type BuildHistoryEntry, type BuildHistoryQuery } from "@pipelab/shared";
import { BuildHistoryStorage } from "./build-history";
import { SubscriptionRequiredError } from "@pipelab/shared";
import { PipelabContext } from "../context";

const checkBuildHistoryAuthorization = async (): Promise<boolean> => {
  // Always authorize for now - relying on frontend auth checks only
  const isAuthorized = true;

  if (!isAuthorized) {
    throw new SubscriptionRequiredError("build-history");
  }

  return true;
};

export const filterBuildHistoryEntries = (
  entries: BuildHistoryEntry[],
  query?: BuildHistoryQuery,
) =>
  entries.filter(
    (entry) =>
      (!query?.pipelineId || entry.pipelineId === query.pipelineId) &&
      (!query?.workflowId || entry.workflowId === query.workflowId),
  );

export const registerHistoryHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();
  const buildHistoryStorage = new BuildHistoryStorage(context);

  // Build History Handlers
  handle("build-history:save", async (event, { send, value }) => {
    try {
      await checkBuildHistoryAuthorization();

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

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
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
      logger().debug("Processing build-history:get request");
      await checkBuildHistoryAuthorization();

      const entry = await buildHistoryStorage.get(value.id, value.pipelineId);
      send({
        type: "end",
        data: { type: "success", result: { entry } },
      });
    } catch (error) {
      logger().error("Failed to get build history entry:", error);

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
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
      logger().debug("Processing build-history:get-all request");
      await checkBuildHistoryAuthorization();

      const allEntries = await buildHistoryStorage.getAll();
      const filteredEntries = filterBuildHistoryEntries(allEntries, value?.query);

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

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
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
      await checkBuildHistoryAuthorization();

      await buildHistoryStorage.update(value.id, value.updates, value.pipelineId);
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error("Failed to update build history entry:", error);

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
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
      await checkBuildHistoryAuthorization();

      await buildHistoryStorage.delete(value.id, value.pipelineId);
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error("Failed to delete build history entry:", error);

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
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
      await checkBuildHistoryAuthorization();

      await buildHistoryStorage.clear();
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error("Failed to clear build history:", error);

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
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

  handle("build-history:clear-by-pipeline", async (event, { send, value }) => {
    try {
      await checkBuildHistoryAuthorization();

      await buildHistoryStorage.clearByPipeline(value.pipelineId);
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error(`Failed to clear build history for pipeline ${value.pipelineId}:`, error);

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
        });
        return;
      }

      send({
        type: "end",
        data: {
          type: "error",
          ipcError:
            error instanceof Error ? error.message : "Failed to clear build history for pipeline",
        },
      });
    }
  });

  handle("build-history:get-storage-info", async (event, { send }) => {
    try {
      await checkBuildHistoryAuthorization();

      const info = await buildHistoryStorage.getStorageInfo();
      send({
        type: "end",
        data: { type: "success", result: info },
      });
    } catch (error) {
      logger().error("Failed to get build history storage info:", error);

      if (error instanceof SubscriptionRequiredError) {
        send({
          type: "end",
          data: { type: "error", ipcError: error.userMessage, code: error.code },
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
};
