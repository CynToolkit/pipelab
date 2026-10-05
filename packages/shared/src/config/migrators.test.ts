import { describe, expect, it } from "vitest";
import {
  appSettingsMigrator,
  connectionsMigrator,
  defaultFileRepo,
  fileRepoMigrations,
} from "./migrators";
import { AppConfigV6, AppConfigV7 } from "../config.schema";

describe("fileRepoMigrations", () => {
  it("migrates legacy project indexes while dropping Pipeline metadata", async () => {
    const v1 = {
      version: "1.0.0" as const,
      data: {
        oldPipeline: {
          project: "main",
          type: "internal" as const,
          configName: "oldPipeline",
          lastModified: "2026-06-04",
        },
      },
    };

    const migrated = await fileRepoMigrations.migrate(v1);

    expect(migrated).toStrictEqual({
      version: "4.0.0",
      projects: [
        {
          id: "main",
          name: "Default project",
          description: "The initial default project",
        },
      ],
      workflows: [],
    });
  });

  it("preserves V3 projects and workflows while dropping the pipeline index", async () => {
    const v3 = {
      version: "3.0.0" as const,
      projects: [{ id: "project-1", name: "Project", description: "Keep this project" }],
      pipelines: [{ id: "old-pipeline" }],
      workflows: [
        {
          id: "workflow-1",
          project: "project-1",
          lastModified: "2026-06-04",
          type: "internal-workflow" as const,
          configName: "workflows/workflow-1",
        },
      ],
    };

    const migrated = await fileRepoMigrations.migrate(v3);

    expect(migrated).toStrictEqual({
      version: "4.0.0",
      projects: v3.projects,
      workflows: v3.workflows,
    });
  });

  it("creates a pipeline-free default project index", () => {
    expect(defaultFileRepo).toStrictEqual({
      version: "4.0.0",
      projects: [
        {
          id: "main",
          name: "Default project",
          description: "The initial default project",
        },
      ],
      workflows: [],
    });
  });
});

describe("appSettingsMigrator", () => {
  it("migrates AppConfigV6 to AppConfigV7", async () => {
    const v6: AppConfigV6 = {
      version: "6.0.0",
      theme: "dark",
      cacheFolder: "/some/path",
      clearTemporaryFoldersOnPipelineEnd: true,
      locale: "fr-FR",
      tours: {
        dashboard: { step: 1, completed: true },
        editor: { step: 2, completed: false },
      },
      autosave: false,
    };

    const v7 = await appSettingsMigrator.migrate(v6, { target: "7.0.0" });

    expect(v7).toStrictEqual({
      version: "7.0.0",
      theme: "dark",
      locale: "fr-FR",
      tours: {
        dashboard: { step: 1, completed: true },
        editor: { step: 2, completed: false },
      },
      autosave: false,
      agents: [],
      plugins: expect.any(Array),
      cacheFolder: "/some/path",
    });
  });
});

describe("connectionsMigrator", () => {
  it("initializes the current connection config", async () => {
    await expect(connectionsMigrator.migrate(undefined)).resolves.toStrictEqual({
      version: "1.0.0",
      connections: [],
    });
  });
});

describe("settings without plugin enablement", () => {
  it("drops enabled and disabled V7 entries while preserving actual preferences", async () => {
    const settings: AppConfigV7 = {
      version: "7.0.0",
      theme: "dark",
      locale: "fr-FR",
      autosave: false,
      cacheFolder: "/cache",
      tempFolder: "/temp",
      agents: [{ id: "remote", name: "Remote", url: "http://localhost:33753" }],
      tours: { dashboard: { step: 3, completed: true }, editor: { step: 1, completed: false } },
      plugins: [
        { name: "@pipelab/plugin-steam", enabled: false, description: "Steam" },
        { name: "community-example", enabled: true, description: "Obsolete" },
      ],
    };
    const { plugins: _, ...preferences } = settings;
    expect(await appSettingsMigrator.migrate(settings)).toStrictEqual({
      ...preferences,
      version: "8.0.0",
    });
  });
  it("creates current defaults without fake provider configurability", async () => {
    const settings = await appSettingsMigrator.migrate(undefined);
    expect(settings.version).toBe("8.0.0");
    expect(settings).not.toHaveProperty("plugins");
    expect(await appSettingsMigrator.migrate(settings)).toEqual(settings);
  });
});

it("preserves saved integration IDs and credential fields", async () => {
  const connections = {
    version: "1.0.0" as const,
    connections: [
      {
        id: "steam-account",
        pluginName: "@pipelab/plugin-steam",
        integrationName: "Steam Account",
        name: "Release account",
        createdAt: "2026-01-01",
        isDefault: true,
        username: "test-account",
        password: "test-fixture-password",
      },
    ],
  };
  expect(await connectionsMigrator.migrate(connections)).toStrictEqual(connections);
});
