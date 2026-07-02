import { useAPI } from "../ipc-core";
import { useLogger } from "@pipelab/shared";
import { PipelabContext, getDefaultUserDataPath, isDev, PipelabEnv } from "../context";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  FileRepo,
  SaveLocation,
  AppConfig,
  ConnectionsConfig,
  savedFileMigrator,
} from "@pipelab/shared";
import semver from "semver";

interface MigrationPipelineItem {
  id: string;
  name: string;
  description: string;
  type: "internal" | "external" | "pipelab-cloud";
  lastModifiedStable?: string;
  lastModifiedBeta?: string;
  existsInBeta: boolean;
}

interface MigrationProjectItem {
  id: string;
  name: string;
  description: string;
  pipelines: MigrationPipelineItem[];
}

export const registerMigrationHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  const getFileMetadata = async (filePath: string) => {
    const exists = existsSync(filePath);
    let mtime = Date.now();
    let version: string | null = null;

    if (exists) {
      try {
        const stat = await fs.stat(filePath);
        mtime = stat.mtime ? stat.mtime.getTime() : Date.now();
      } catch (e) {
        mtime = Date.now();
      }

      try {
        const content = await fs.readFile(filePath, "utf8");
        const json = JSON.parse(content);
        version = json && typeof json.version === "string" ? json.version : null;
      } catch (e) {
        // Version remains null
      }
    } else {
      mtime = Date.now();
    }

    return { exists, mtime, version };
  };

  const isVersionImportable = (sourceVer: string | null, targetVer: string | null): boolean => {
    if (!sourceVer) return false;
    if (!targetVer) return true;

    try {
      const coercedSource = semver.coerce(sourceVer);
      const coercedTarget = semver.coerce(targetVer);
      if (!coercedSource) return false;
      if (!coercedTarget) return true;
      return semver.lte(coercedSource, coercedTarget);
    } catch {
      return sourceVer <= targetVer;
    }
  };

  handle("migration:scan-stable", async (_, { send, value }) => {
    logger().info("[Migration] Scanning other channel database...");
    try {
      let sourceEnv: PipelabEnv = "prod";
      if (value?.sourceChannel === "stable") {
        sourceEnv = "prod";
      } else if (value?.sourceChannel === "beta") {
        sourceEnv = "beta";
      } else {
        const isStable =
          context.userDataPath.endsWith("app") || !context.userDataPath.includes("app-beta");
        sourceEnv = isStable ? "beta" : "prod";
      }
      const sourcePath = getDefaultUserDataPath(sourceEnv);
      const targetPath = context.userDataPath;

      if (sourcePath === targetPath) {
        logger().info("[Migration] Running in same channel. Disabling migration scan.");
        return send({
          type: "end",
          data: {
            type: "success",
            result: {
              sourceChannel: sourceEnv === "prod" ? "Stable" : "Beta",
              targetChannel: isDev
                ? "Dev"
                : context.userDataPath.endsWith("app") || !context.userDataPath.includes("app-beta")
                  ? "Stable"
                  : "Beta",
              settingsExists: false,
              settingsVersion: null,
              settingsVersionTarget: null,
              settingsMtimeSource: Date.now(),
              settingsMtimeTarget: Date.now(),
              settingsImportable: false,
              connectionsExists: false,
              connectionsCount: 0,
              connectionsVersion: null,
              connectionsVersionTarget: null,
              connectionsMtimeSource: Date.now(),
              connectionsMtimeTarget: Date.now(),
              connectionsImportable: false,
              projectsExists: false,
              projectsVersion: null,
              projectsVersionTarget: null,
              projectsMtimeSource: Date.now(),
              projectsMtimeTarget: Date.now(),
              projectsImportable: false,
              projects: [],
            },
          },
        });
      }

      const sourceContext = new PipelabContext({ userDataPath: sourcePath, releaseTag: sourceEnv });

      const sourceSettingsPath = sourceContext.getSettingsPath();
      const targetSettingsPath = context.getSettingsPath();

      const sourceConnectionsPath = sourceContext.getConnectionsPath();
      const targetConnectionsPath = context.getConnectionsPath();

      const sourceProjectsPath = sourceContext.getProjectsPath();
      const targetProjectsPath = context.getProjectsPath();

      const sourceSettingsMeta = await getFileMetadata(sourceSettingsPath);
      const targetSettingsMeta = await getFileMetadata(targetSettingsPath);

      const sourceConnectionsMeta = await getFileMetadata(sourceConnectionsPath);
      const targetConnectionsMeta = await getFileMetadata(targetConnectionsPath);

      const sourceProjectsMeta = await getFileMetadata(sourceProjectsPath);
      const targetProjectsMeta = await getFileMetadata(targetProjectsPath);

      const settingsExists = sourceSettingsMeta.exists;
      const settingsVersion = sourceSettingsMeta.version;
      const settingsMtimeSource = sourceSettingsMeta.mtime;
      const settingsMtimeTarget = targetSettingsMeta.mtime;
      const settingsImportable = isVersionImportable(settingsVersion, targetSettingsMeta.version);

      const connectionsExists = sourceConnectionsMeta.exists;
      const connectionsVersion = sourceConnectionsMeta.version;
      const connectionsMtimeSource = sourceConnectionsMeta.mtime;
      const connectionsMtimeTarget = targetConnectionsMeta.mtime;
      const connectionsImportable = isVersionImportable(
        connectionsVersion,
        targetConnectionsMeta.version,
      );

      const projectsExists = sourceProjectsMeta.exists;
      const projectsVersion = sourceProjectsMeta.version;
      const projectsMtimeSource = sourceProjectsMeta.mtime;
      const projectsMtimeTarget = targetProjectsMeta.mtime;
      const projectsImportable = isVersionImportable(projectsVersion, targetProjectsMeta.version);

      let connectionsCount = 0;
      try {
        if (sourceConnectionsMeta.exists) {
          const connContent = await fs.readFile(sourceConnectionsPath, "utf8");
          const connJson = JSON.parse(connContent) as ConnectionsConfig;
          if (connJson && Array.isArray(connJson.connections)) {
            connectionsCount = connJson.connections.length;
          }
        }
      } catch (err) {
        logger().error("[Migration] Error parsing source connections.json:", err);
      }

      let sourceProjectsList: FileRepo["projects"] = [];
      let sourcePipelinesList: SaveLocation[] = [];
      try {
        if (sourceProjectsMeta.exists) {
          const projContent = await fs.readFile(sourceProjectsPath, "utf8");
          const projJson = JSON.parse(projContent) as FileRepo;
          sourceProjectsList = projJson.projects || [];
          sourcePipelinesList = projJson.pipelines || [];
        }
      } catch (err) {
        logger().error("[Migration] Error parsing source projects.json:", err);
      }

      let targetPipelinesList: SaveLocation[] = [];
      try {
        if (targetProjectsMeta.exists) {
          const targetProjContent = await fs.readFile(targetProjectsPath, "utf8");
          const targetProjJson = JSON.parse(targetProjContent) as FileRepo;
          targetPipelinesList = targetProjJson.pipelines || [];
        }
      } catch (err) {
        // Safe to ignore if target hasn't initialized projects yet
      }

      const projectsReport: MigrationProjectItem[] = [];
      for (const proj of sourceProjectsList) {
        const projPipelines = sourcePipelinesList.filter((p) => p.project === proj.id);
        const pipelinesReport: MigrationPipelineItem[] = [];

        for (const pipe of projPipelines) {
          const targetPipe = targetPipelinesList.find((bp) => bp.id === pipe.id);
          const existsInBeta = !!targetPipe;

          let pipeName = pipe.id;
          let pipeDesc = "";
          if (pipe.type === "internal") {
            const sourcePipeFile = sourceContext.getConfigPath(`${pipe.configName}.json`);
            try {
              if (existsSync(sourcePipeFile)) {
                const pipeContent = await fs.readFile(sourcePipeFile, "utf8");
                const rawJson = JSON.parse(pipeContent);
                const pipeJson = await savedFileMigrator.migrate(rawJson);
                pipeName = pipeJson.name || pipeName;
                pipeDesc = pipeJson.description || pipeDesc;
              }
            } catch (err) {
              logger().error(
                `[Migration] Error reading source pipeline file ${sourcePipeFile}:`,
                err,
              );
            }
          } else if (pipe.type === "external") {
            pipeName = pipe.summary?.name || pipeName;
            pipeDesc = pipe.summary?.description || pipeDesc;
          }

          pipelinesReport.push({
            id: pipe.id,
            name: pipeName,
            description: pipeDesc,
            type: pipe.type,
            lastModifiedStable: pipe.type !== "pipelab-cloud" ? pipe.lastModified : undefined,
            lastModifiedBeta:
              targetPipe && targetPipe.type !== "pipelab-cloud"
                ? targetPipe.lastModified
                : undefined,
            existsInBeta,
          });
        }

        projectsReport.push({
          id: proj.id,
          name: proj.name,
          description: proj.description || "",
          pipelines: pipelinesReport,
        });
      }

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            sourceChannel: sourceEnv === "prod" ? "Stable" : "Beta",
            targetChannel: isDev
              ? "Dev"
              : context.userDataPath.endsWith("app") || !context.userDataPath.includes("app-beta")
                ? "Stable"
                : "Beta",
            settingsExists,
            settingsVersion,
            settingsVersionTarget: targetSettingsMeta.version,
            settingsMtimeSource,
            settingsMtimeTarget,
            settingsImportable,
            connectionsExists,
            connectionsCount,
            connectionsVersion,
            connectionsVersionTarget: targetConnectionsMeta.version,
            connectionsMtimeSource,
            connectionsMtimeTarget,
            connectionsImportable,
            projectsExists,
            projectsVersion,
            projectsVersionTarget: targetProjectsMeta.version,
            projectsMtimeSource,
            projectsMtimeTarget,
            projectsImportable,
            projects: projectsReport,
          },
        },
      });
    } catch (e) {
      logger().error("[Migration] Error scanning other channel folder:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Failed to scan other channel database",
        },
      });
    }
  });

  handle("migration:perform", async (_, { send, value }) => {
    logger().info("[Migration] Performing migration...");
    try {
      const {
        migrateSettings,
        migrateConnections,
        selectedProjects,
        selectedPipelines,
        sourceChannel,
      } = value;

      let sourceEnv: PipelabEnv = "prod";
      if (sourceChannel === "stable") {
        sourceEnv = "prod";
      } else if (sourceChannel === "beta") {
        sourceEnv = "beta";
      } else {
        const isStable =
          context.userDataPath.endsWith("app") || !context.userDataPath.includes("app-beta");
        sourceEnv = isStable ? "beta" : "prod";
      }
      const sourcePath = getDefaultUserDataPath(sourceEnv);
      const sourceContext = new PipelabContext({ userDataPath: sourcePath, releaseTag: sourceEnv });

      const sourceConfigDir = sourceContext.getConfigPath();
      const targetConfigDir = context.getConfigPath();

      // 1. Check folder validity
      if (sourcePath === context.userDataPath) {
        throw new Error("Cannot migrate data: Source and target directories are identical.");
      }

      // 2. Create backup of target's config directory (excluding backups folder itself)
      if (existsSync(targetConfigDir)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupDir = context.getConfigPath("backups", `backup_${timestamp}`);
        await fs.mkdir(backupDir, { recursive: true });

        const entries = await fs.readdir(targetConfigDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "backups") continue;
          const srcPath = join(targetConfigDir, entry.name);
          const destPath = join(backupDir, entry.name);
          try {
            await fs.cp(srcPath, destPath, { recursive: true });
          } catch (copyErr) {
            logger().error(`[Migration] Failed to backup ${entry.name}:`, copyErr);
          }
        }
        logger().info(`[Migration] Config backup successfully created at ${backupDir}`);
      }

      // 3. Settings migration (Merge)
      if (migrateSettings) {
        const sourceSettingsFile = sourceContext.getSettingsPath();
        const targetSettingsFile = context.getSettingsPath();

        const sourceMeta = await getFileMetadata(sourceSettingsFile);
        const targetMeta = await getFileMetadata(targetSettingsFile);
        if (!isVersionImportable(sourceMeta.version, targetMeta.version)) {
          throw new Error("Cannot migrate settings: Source version is newer than current version.");
        }

        if (existsSync(sourceSettingsFile)) {
          let stableSettings: AppConfig = {
            version: "7.0.0",
            locale: "en-US",
            theme: "light",
            autosave: true,
            agents: [],
            plugins: [],
            tours: {
              dashboard: { step: 0, completed: false },
              editor: { step: 0, completed: false },
            },
          };
          try {
            const stableContent = await fs.readFile(sourceSettingsFile, "utf8");
            stableSettings = JSON.parse(stableContent) as AppConfig;
          } catch (e) {
            logger().error("[Migration] Failed to read source settings.json:", e);
          }

          let betaSettings: AppConfig = {
            version: "7.0.0",
            locale: "en-US",
            theme: "light",
            autosave: true,
            agents: [],
            plugins: [],
            tours: {
              dashboard: { step: 0, completed: false },
              editor: { step: 0, completed: false },
            },
          };
          if (existsSync(targetSettingsFile)) {
            try {
              const betaContent = await fs.readFile(targetSettingsFile, "utf8");
              betaSettings = JSON.parse(betaContent) as AppConfig;
            } catch (e) {
              // Keep default
            }
          }

          // Merge primitives
          betaSettings.theme = stableSettings.theme ?? betaSettings.theme;
          betaSettings.locale = stableSettings.locale ?? betaSettings.locale;
          betaSettings.autosave = stableSettings.autosave ?? betaSettings.autosave;

          // Merge tours
          if (stableSettings.tours) {
            betaSettings.tours = betaSettings.tours || {
              dashboard: { step: 0, completed: false },
              editor: { step: 0, completed: false },
            };
            if (stableSettings.tours.dashboard) {
              betaSettings.tours.dashboard = stableSettings.tours.dashboard;
            }
            if (stableSettings.tours.editor) {
              betaSettings.tours.editor = stableSettings.tours.editor;
            }
          }

          // Merge agents (by id)
          const betaAgents = betaSettings.agents || [];
          const stableAgents = stableSettings.agents || [];
          for (const sAgent of stableAgents) {
            const existingIdx = betaAgents.findIndex((a) => a.id === sAgent.id);
            if (existingIdx >= 0) {
              betaAgents[existingIdx] = { ...sAgent };
            } else {
              betaAgents.push({ ...sAgent });
            }
          }
          betaSettings.agents = betaAgents;

          // Merge plugins (by name)
          const betaPlugins = betaSettings.plugins || [];
          const stablePlugins = stableSettings.plugins || [];
          for (const sPlugin of stablePlugins) {
            const existingIdx = betaPlugins.findIndex((p) => p.name === sPlugin.name);
            if (existingIdx >= 0) {
              betaPlugins[existingIdx] = { ...sPlugin };
            } else {
              betaPlugins.push({ ...sPlugin });
            }
          }
          betaSettings.plugins = betaPlugins;

          await fs.mkdir(dirname(targetSettingsFile), { recursive: true });
          await fs.writeFile(targetSettingsFile, JSON.stringify(betaSettings, null, 2));
          logger().info("[Migration] Settings merged successfully");
        }
      }

      // 4. Connections migration (Merge)
      if (migrateConnections) {
        const sourceConnectionsFile = sourceContext.getConnectionsPath();
        const targetConnectionsFile = context.getConnectionsPath();

        const sourceMeta = await getFileMetadata(sourceConnectionsFile);
        const targetMeta = await getFileMetadata(targetConnectionsFile);
        if (!isVersionImportable(sourceMeta.version, targetMeta.version)) {
          throw new Error(
            "Cannot migrate connections: Source version is newer than current version.",
          );
        }

        if (existsSync(sourceConnectionsFile)) {
          let stableConnections: ConnectionsConfig = { version: "1.0.0", connections: [] };
          try {
            const stableContent = await fs.readFile(sourceConnectionsFile, "utf8");
            stableConnections = JSON.parse(stableContent) as ConnectionsConfig;
          } catch (e) {
            logger().error("[Migration] Failed to read source connections.json:", e);
          }

          let betaConnections: ConnectionsConfig = { version: "1.0.0", connections: [] };
          if (existsSync(targetConnectionsFile)) {
            try {
              const betaContent = await fs.readFile(targetConnectionsFile, "utf8");
              betaConnections = JSON.parse(betaContent) as ConnectionsConfig;
            } catch (e) {
              // Keep default
            }
          }

          betaConnections.connections = betaConnections.connections || [];
          stableConnections.connections = stableConnections.connections || [];

          for (const sConn of stableConnections.connections) {
            const existingIdx = betaConnections.connections.findIndex((c) => c.id === sConn.id);
            if (existingIdx >= 0) {
              betaConnections.connections[existingIdx] = { ...sConn };
            } else {
              betaConnections.connections.push({ ...sConn });
            }
          }

          await fs.mkdir(dirname(targetConnectionsFile), { recursive: true });
          await fs.writeFile(targetConnectionsFile, JSON.stringify(betaConnections, null, 2));
          logger().info("[Migration] Connections merged successfully");
        }
      }

      // 5. Projects and Pipelines migration
      if (selectedPipelines.length > 0 || selectedProjects.length > 0) {
        const sourceProjectsFile = sourceContext.getProjectsPath();
        const targetProjectsFile = context.getProjectsPath();

        const sourceMeta = await getFileMetadata(sourceProjectsFile);
        const targetMeta = await getFileMetadata(targetProjectsFile);
        if (!isVersionImportable(sourceMeta.version, targetMeta.version)) {
          throw new Error("Cannot migrate projects: Source version is newer than current version.");
        }

        // Read source projects
        let stableFileRepo: FileRepo = { version: "3.0.0", projects: [], pipelines: [] };
        if (existsSync(sourceProjectsFile)) {
          const stableContent = await fs.readFile(sourceProjectsFile, "utf8");
          stableFileRepo = JSON.parse(stableContent) as FileRepo;
        }

        // Read or initialize current target projects
        let betaFileRepo: FileRepo = { version: "3.0.0", projects: [], pipelines: [] };
        if (existsSync(targetProjectsFile)) {
          try {
            const betaContent = await fs.readFile(targetProjectsFile, "utf8");
            betaFileRepo = JSON.parse(betaContent) as FileRepo;
          } catch (readErr) {
            logger().warn(
              "[Migration] Failed to parse existing target projects.json, starting fresh:",
              readErr,
            );
          }
        }

        betaFileRepo.projects = betaFileRepo.projects || [];
        betaFileRepo.pipelines = betaFileRepo.pipelines || [];

        // Copy selected projects metadata
        for (const projId of selectedProjects) {
          const stableProj = stableFileRepo.projects.find((p) => p.id === projId);
          if (stableProj) {
            const existingProjIdx = betaFileRepo.projects.findIndex((p) => p.id === projId);
            if (existingProjIdx >= 0) {
              betaFileRepo.projects[existingProjIdx] = { ...stableProj };
            } else {
              betaFileRepo.projects.push({ ...stableProj });
            }
          }
        }

        // Copy selected pipelines metadata and copy the pipeline config files
        for (const pipeId of selectedPipelines) {
          const stablePipe = (stableFileRepo.pipelines || []).find((p) => p.id === pipeId);
          if (stablePipe) {
            // Ensure the parent project metadata exists in target
            const parentProjId = stablePipe.project;
            const projectExists = betaFileRepo.projects.some((p) => p.id === parentProjId);
            if (!projectExists) {
              const stableProj = stableFileRepo.projects.find((p) => p.id === parentProjId);
              if (stableProj) {
                betaFileRepo.projects.push({ ...stableProj });
              }
            }

            // Copy and migrate pipeline file if internal
            if (stablePipe.type === "internal") {
              const stablePipeFile = sourceContext.getConfigPath(`${stablePipe.configName}.json`);
              const betaPipeFile = context.getConfigPath(`${stablePipe.configName}.json`);
              if (existsSync(stablePipeFile)) {
                await fs.mkdir(dirname(betaPipeFile), { recursive: true });
                try {
                  const pipeContent = await fs.readFile(stablePipeFile, "utf8");
                  const rawJson = JSON.parse(pipeContent);
                  const migratedJson = await savedFileMigrator.migrate(rawJson);
                  await fs.writeFile(betaPipeFile, JSON.stringify(migratedJson, null, 2));
                  logger().info(
                    `[Migration] Migrated and copied pipeline file: ${stablePipe.configName}`,
                  );
                } catch (err) {
                  await fs.copyFile(stablePipeFile, betaPipeFile);
                  logger().error(
                    `[Migration] Error migrating during copy of ${stablePipe.configName}, fallback to direct copy:`,
                    err,
                  );
                }
              }
            }

            // Create updated pipeline metadata with modification date set to now timestamp
            const updatedPipe = {
              ...stablePipe,
            };
            if (updatedPipe.type !== "pipelab-cloud") {
              (updatedPipe as any).lastModified = new Date().toISOString();
            }

            // Update target projects.json
            const existingPipeIdx = betaFileRepo.pipelines.findIndex((p) => p.id === pipeId);
            if (existingPipeIdx >= 0) {
              betaFileRepo.pipelines[existingPipeIdx] = updatedPipe;
            } else {
              betaFileRepo.pipelines.push(updatedPipe);
            }
          }
        }

        // Save projects.json
        await fs.mkdir(dirname(targetProjectsFile), { recursive: true });
        await fs.writeFile(targetProjectsFile, JSON.stringify(betaFileRepo, null, 2));
        logger().info("[Migration] Merged and saved projects.json successfully");
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
      logger().error("[Migration] Error performing migration:", e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Failed to migrate selected data",
        },
      });
    }
  });
};
