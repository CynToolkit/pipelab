import { useAPI } from "../ipc-core";
import { useLogger, type BuildHistoryEntry, type BuildHistoryQuery } from "@pipelab/shared";
import { BuildHistoryStorage } from "./build-history";
import { PipelabContext } from "../context";

export const filterBuildHistoryEntries = (
  entries: BuildHistoryEntry[],
  query?: BuildHistoryQuery,
) =>
  entries.filter(
    (entry) =>
      (!query?.projectId || entry.projectId === query.projectId) &&
      (!query?.workflowId || entry.workflowId === query.workflowId),
  );

export const registerHistoryHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();
  const buildHistoryStorage = new BuildHistoryStorage(context);

  // Build History Handlers
  handle("build-history:save", async (event, { send, value }) => {
    try {
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

      const entry = await buildHistoryStorage.get(value.id, value.projectId);
      send({
        type: "end",
        data: { type: "success", result: { entry } },
      });
    } catch (error) {
      logger().error("Failed to get build history entry:", error);

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
      await buildHistoryStorage.update(value.id, value.updates, value.projectId);
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error("Failed to update build history entry:", error);

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
      await buildHistoryStorage.delete(value.id, value.projectId);
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error("Failed to delete build history entry:", error);

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
      await buildHistoryStorage.clear();
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error("Failed to clear build history:", error);

      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to clear build history",
        },
      });
    }
  });

  handle("build-history:clear-by-project", async (event, { send, value }) => {
    try {
      await buildHistoryStorage.clearByProject(value.projectId);
      send({
        type: "end",
        data: { type: "success", result: { result: "ok" } },
      });
    } catch (error) {
      logger().error(`Failed to clear build history for project ${value.projectId}:`, error);

      send({
        type: "end",
        data: {
          type: "error",
          ipcError:
            error instanceof Error ? error.message : "Failed to clear build history for project",
        },
      });
    }
  });

  handle("build-history:get-storage-info", async (event, { send }) => {
    try {
      const info = await buildHistoryStorage.getStorageInfo();
      send({
        type: "end",
        data: { type: "success", result: info },
      });
    } catch (error) {
      logger().error("Failed to get build history storage info:", error);

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
