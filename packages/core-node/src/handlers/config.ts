import { useAPI } from "../ipc-core";
import {
  useLogger,
  appSettingsMigrator,
  connectionsMigrator,
  fileRepoMigrations,
  type BrowserProfileCandidate,
} from "@pipelab/shared";
import {
  setupSettingsConfigFile,
  setupConnectionsConfigFile,
  setupProjectsConfigFile,
  setupPipelineConfigFileByName,
  setupPipelineConfigFileByPath,
  deletePipelineConfigFileByName,
  deletePipelineConfigFileByPath,
  setupWorkflowConfigFileByName,
  deleteWorkflowConfigFileByName,
} from "../config";
import { PipelabContext } from "../context";
import { discoverBrowserProfiles, inspectChromiumProfile } from "@pipelab/plugin-construct";
import { ConstructProfileDiscoveryCache } from "./construct-profile-cache";

export const registerConfigHandlers = (context: PipelabContext) => {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= context.getThirdPartyPath("playwright-browsers");
  const { handle } = useAPI();
  const { logger } = useLogger();
  const profileCache = new ConstructProfileDiscoveryCache(discoverBrowserProfiles, async (path) => {
    const inspected = await inspectChromiumProfile(path);
    const candidate: BrowserProfileCandidate = {
      browser: "Manual",
      profileName: path.split(/[\\/]/).pop() || path,
      path,
      isDefault: false,
      ...inspected,
      score: null,
      reason: inspected.usable ? undefined : "Folder is not a readable Chromium profile",
    };
    return candidate;
  });

  handle("construct:profiles:discover", async (_, { send, value }) => {
    try {
      const profiles = await profileCache.get(value.path, value.forceRefresh);
      send({ type: "end", data: { type: "success", result: profiles } });
    } catch (error) {
      send({ type: "end", data: { type: "error", ipcError: error instanceof Error ? error.message : "Unable to discover browser profiles" } });
    }
  });

  // Settings
  handle("settings:load", async (_, { send }) => {
    logger().info("settings:load");
    try {
      const manager = await setupSettingsConfigFile(context);
      const json = await manager.getConfig();
      send({
        type: "end",
        data: { type: "success", result: json },
      });
    } catch (e) {
      logger().error("settings:load error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to load settings",
        },
      });
    }
  });

  handle("settings:save", async (_, { send, value }) => {
    const { data } = value;
    try {
      const manager = await setupSettingsConfigFile(context);
      const json = typeof data === "string" ? JSON.parse(data) : data;
      await manager.setConfig(json);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error("settings:save error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to save settings",
        },
      });
    }
  });

  handle("settings:reset", async (_, { send, value }) => {
    const { key } = value;
    try {
      const manager = await setupSettingsConfigFile(context);
      const currentConfig = await manager.getConfig();
      const defaultValue = (appSettingsMigrator.defaultValue as any)[key];
      await manager.setConfig({
        ...(currentConfig ? (currentConfig as any) : {}),
        [key]: defaultValue,
      } as any);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error("settings:reset error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to reset settings",
        },
      });
    }
  });

  // Connections
  handle("connections:load", async (_, { send }) => {
    logger().info("connections:load");
    try {
      const manager = await setupConnectionsConfigFile(context);
      const json = await manager.getConfig();
      send({
        type: "end",
        data: { type: "success", result: json },
      });
    } catch (e) {
      logger().error("connections:load error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to load connections",
        },
      });
    }
  });

  handle("connections:save", async (_, { send, value }) => {
    const { data } = value;
    try {
      const manager = await setupConnectionsConfigFile(context);
      const json = typeof data === "string" ? JSON.parse(data) : data;
      await manager.setConfig(json);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error("connections:save error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to save connections",
        },
      });
    }
  });

  handle("connections:reset", async (_, { send, value }) => {
    const { key } = value;
    try {
      const manager = await setupConnectionsConfigFile(context);
      const currentConfig = await manager.getConfig();
      const defaultValue = (connectionsMigrator.defaultValue as any)[key];
      await manager.setConfig({
        ...(currentConfig ? (currentConfig as any) : {}),
        [key]: defaultValue,
      } as any);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error("connections:reset error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to reset connections",
        },
      });
    }
  });

  // Projects
  handle("projects:load", async (_, { send }) => {
    logger().info("projects:load");
    try {
      const manager = await setupProjectsConfigFile(context);
      const json = await manager.getConfig();
      send({
        type: "end",
        data: { type: "success", result: json },
      });
    } catch (e) {
      logger().error("projects:load error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to load projects",
        },
      });
    }
  });

  handle("projects:save", async (_, { send, value }) => {
    const { data } = value;
    try {
      const manager = await setupProjectsConfigFile(context);
      const json = typeof data === "string" ? JSON.parse(data) : data;
      await manager.setConfig(json);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error("projects:save error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to save projects",
        },
      });
    }
  });

  handle("projects:reset", async (_, { send, value }) => {
    const { key } = value;
    try {
      const manager = await setupProjectsConfigFile(context);
      const currentConfig = await manager.getConfig();
      const defaultValue = (fileRepoMigrations.defaultValue as any)[key];
      await manager.setConfig({
        ...(currentConfig ? (currentConfig as any) : {}),
        [key]: defaultValue,
      } as any);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error("projects:reset error:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Unable to reset projects",
        },
      });
    }
  });

  // Pipeline (ByName)
  handle("pipeline:load-by-name", async (_, { send, value }) => {
    const { name } = value;
    logger().info("pipeline:load-by-name", name);
    try {
      const manager = await setupPipelineConfigFileByName(name, context);
      const json = await manager.getConfig();
      send({
        type: "end",
        data: { type: "success", result: json },
      });
    } catch (e) {
      logger().error(`pipeline:load-by-name error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to load pipeline ${name}`,
        },
      });
    }
  });

  // Pipeline (ByPath)
  handle("pipeline:load-by-path", async (_, { send, value }) => {
    const { path: absolutePath } = value;
    logger().info("pipeline:load-by-path", absolutePath);
    try {
      const manager = await setupPipelineConfigFileByPath(absolutePath, context);
      const json = await manager.getConfig();
      send({
        type: "end",
        data: { type: "success", result: json },
      });
    } catch (e) {
      logger().error(`pipeline:load-by-path error for ${absolutePath}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to load pipeline ${absolutePath}`,
        },
      });
    }
  });

  handle("pipeline:save-by-name", async (_, { send, value }) => {
    const { data, name } = value;
    try {
      const manager = await setupPipelineConfigFileByName(name, context);
      const json = typeof data === "string" ? JSON.parse(data) : data;
      await manager.setConfig(json);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error(`pipeline:save-by-name error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to save pipeline ${name}`,
        },
      });
    }
  });

  handle("pipeline:save-by-path", async (_, { send, value }) => {
    const { data, path: absolutePath } = value;
    try {
      const manager = await setupPipelineConfigFileByPath(absolutePath, context);
      const json = typeof data === "string" ? JSON.parse(data) : data;
      await manager.setConfig(json);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error(`pipeline:save-by-path error for ${absolutePath}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to save pipeline ${absolutePath}`,
        },
      });
    }
  });

  handle("pipeline:delete-by-name", async (_, { send, value }) => {
    const { name } = value;
    logger().info("pipeline:delete-by-name", name);
    try {
      await deletePipelineConfigFileByName(name, context);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error(`pipeline:delete-by-name error for ${name}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to delete pipeline ${name}`,
        },
      });
    }
  });

  handle("pipeline:delete-by-path", async (_, { send, value }) => {
    const { path: absolutePath } = value;
    logger().info("pipeline:delete-by-path", absolutePath);
    try {
      await deletePipelineConfigFileByPath(absolutePath, context);
      send({
        type: "end",
        data: { type: "success", result: "ok" },
      });
    } catch (e) {
      logger().error(`pipeline:delete-by-path error for ${absolutePath}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : `Unable to delete pipeline ${absolutePath}`,
        },
      });
    }
  });

  handle("workflow:load-by-name", async (_, { send, value }) => {
    try {
      const manager = await setupWorkflowConfigFileByName(value.name, context);
      send({ type: "end", data: { type: "success", result: await manager.getConfig() } });
    } catch (e) {
      send({ type: "end", data: { type: "error", ipcError: e instanceof Error ? e.message : "Unable to load workflow" } });
    }
  });

  handle("workflow:save-by-name", async (_, { send, value }) => {
    try {
      const manager = await setupWorkflowConfigFileByName(value.name, context);
      await manager.setConfig(JSON.parse(value.data));
      send({ type: "end", data: { type: "success", result: "ok" } });
    } catch (e) {
      send({ type: "end", data: { type: "error", ipcError: e instanceof Error ? e.message : "Unable to save workflow" } });
    }
  });

  handle("workflow:delete-by-name", async (_, { send, value }) => {
    try { await deleteWorkflowConfigFileByName(value.name, context); send({ type: "end", data: { type: "success", result: "ok" } }); }
    catch (e) { send({ type: "end", data: { type: "error", ipcError: e instanceof Error ? e.message : "Unable to delete workflow" } }); }
  });
};
