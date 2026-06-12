import { describe, expect, it } from "vitest";
import { SavedFileV1, SavedFileV2, SavedFileV3, SavedFileV4, SavedFileV5 } from "./model";
import {
  savedFileMigrator,
  normalizePipelineConfig,
  appSettingsMigrator,
  fileRepoMigrations,
  connectionsMigrator,
} from "./config/migrators";
import { AppConfigV6, AppConfigV7 } from "./config.schema";

describe("model", () => {
  it("should migrate 1.0.0 to 2.0.0", async () => {
    const v1: SavedFileV1 = {
      version: "1.0.0",
      canvas: {
        blocks: [
          {
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                foo: "bar",
              },
              nodata: undefined,
            },
            type: "action",
            uid: "aaa",
            disabled: false,
          },
          {
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                foo: "bar",
              },
            },
            type: "event",
            uid: "aaa",
          },
        ],
      },
      description: "aaa",
      name: "aaa",
      variables: [
        {
          description: "aaa",
          id: "aaa",
          name: "aaa",
          value: "aaa",
        },
      ],
    };

    const v2 = await savedFileMigrator.migrate(v1, {
      debug: true,
      target: "2.0.0",
    });

    expect(v2).toStrictEqual({
      canvas: {
        blocks: [
          {
            disabled: false,
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                foo: "bar",
              },
              nodata: undefined,
            },
            type: "action",
            uid: "aaa",
          },
        ],
        triggers: [
          {
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                foo: "bar",
              },
            },
            type: "event",
            uid: "aaa",
          },
        ],
      },
      description: "aaa",
      name: "aaa",
      variables: [
        {
          description: "aaa",
          id: "aaa",
          name: "aaa",
          value: "aaa",
        },
      ],
      version: "2.0.0",
    } satisfies SavedFileV2);
  });

  it("should migrate 2.0.0 to 3.0.0", async () => {
    const v2: SavedFileV2 = {
      canvas: {
        blocks: [
          {
            disabled: false,
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                foo: "bar",
              },
              nodata: undefined,
            },
            type: "action",
            uid: "aaa",
          },
        ],
        triggers: [
          {
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                foo: "bar",
              },
            },
            type: "event",
            uid: "aaa",
          },
        ],
      },
      description: "aaa",
      name: "aaa",
      variables: [
        {
          description: "aaa",
          id: "aaa",
          name: "aaa",
          value: "aaa",
        },
      ],
      version: "2.0.0",
    };

    const v3 = await savedFileMigrator.migrate(v2, {
      debug: true,
      target: "3.0.0",
    });

    expect(v3).toStrictEqual({
      canvas: {
        blocks: [
          {
            disabled: false,
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                editor: "editor",
                value: {
                  foo: "bar",
                },
              },
              nodata: {
                editor: "editor",
                value: undefined,
              },
            },
            type: "action",
            uid: "aaa",
          },
        ],
        triggers: [
          {
            origin: {
              nodeId: "aaa",
              pluginId: "aaa",
            },
            params: {
              aaa: {
                foo: "bar",
              },
            },
            type: "event",
            uid: "aaa",
          },
        ],
      },
      description: "aaa",
      name: "aaa",
      variables: [
        {
          description: "aaa",
          id: "aaa",
          name: "aaa",
          value: "aaa",
        },
      ],
      version: "3.0.0",
    } satisfies SavedFileV3);
  });

  it("should migrate 3.0.0 to 4.0.0", async () => {
    const v3: SavedFileV3 = {
      version: "3.0.0",
      canvas: {
        blocks: [],
        triggers: [],
      },
      description: "desc",
      name: "name",
      variables: [],
    };

    const v4 = await savedFileMigrator.migrate(v3, {
      debug: true,
      target: "4.0.0",
    });

    expect(v4).toStrictEqual({
      version: "4.0.0",
      type: "default",
      canvas: {
        blocks: [],
        triggers: [],
      },
      description: "desc",
      name: "name",
      variables: [],
    } satisfies SavedFileV4);
  });

  it("should migrate 4.0.0 to 5.0.0", async () => {
    const v4: SavedFileV4 = {
      version: "4.0.0",
      type: "default",
      canvas: {
        blocks: [
          {
            uid: "b1",
            type: "action",
            origin: {
              pluginId: "electron",
              nodeId: "open",
            },
            params: {},
          },
          {
            uid: "b2",
            type: "action",
            origin: {
              pluginId: "dicord",
              nodeId: "send",
            },
            params: {},
          },
        ],
        triggers: [],
      },
      description: "desc",
      name: "name",
      variables: [],
      plugins: {
        discord: "1.0.0",
      },
    };

    const v5 = await savedFileMigrator.migrate(v4, {
      debug: true,
      target: "5.0.0",
    });

    expect(v5).toStrictEqual({
      version: "5.0.0",
      canvas: {
        blocks: [
          {
            uid: "b1",
            type: "action",
            origin: {
              pluginId: "@pipelab/plugin-electron",
              nodeId: "open",
              // "electron" wasn't in the old plugins map, so version falls back to "latest"
              version: "latest",
            },
            params: {},
          },
          {
            uid: "b2",
            type: "action",
            origin: {
              pluginId: "@pipelab/plugin-discord",
              nodeId: "send",
              // "dicord" mapped to "@pipelab/plugin-discord" which had version "1.0.0" in the old map
              version: "1.0.0",
            },
            params: {},
          },
        ],
        triggers: [],
      },
      description: "desc",
      name: "name",
      variables: [],
      // plugins top-level map is dropped in V5 for default pipelines
    } satisfies SavedFileV5);
  });

  it("should migrate AppConfigV6 to AppConfigV7", async () => {
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
      isInternalMigrationBannerClosed: false,
    });
  });

  describe("normalizePipelineConfig", () => {
    it("should normalize typo and legacy plugin IDs in block origins", () => {
      const config = {
        version: "5.0.0",
        type: "default",
        canvas: {
          blocks: [
            {
              uid: "b1",
              type: "action",
              origin: {
                pluginId: "dicord",
                nodeId: "send",
              },
            },
          ],
        },
      };

      const changed = normalizePipelineConfig(config);
      expect(changed).toBe(true);
      expect(config.canvas.blocks[0].origin.pluginId).toBe("@pipelab/plugin-discord");
    });
  });

  describe("fileRepoMigrations", () => {
    it("should migrate FileRepoV1 (data record) to FileRepoV3 (pipelines array)", async () => {
      const v1 = {
        version: "1.0.0" as const,
        data: {
          "pipeline-1": {
            project: "main",
            type: "internal" as const,
            configName: "pipeline-1",
            lastModified: "2026-06-04",
          },
          "pipeline-2": {
            project: "main",
            type: "external" as const,
            path: "/path/to/pipeline-2.json",
            lastModified: "2026-06-04",
            summary: {
              plugins: ["steam"],
              name: "Test Pipeline 2",
              description: "Legacy external pipeline",
            },
          },
        },
      };

      const v3 = await fileRepoMigrations.migrate(v1, { target: "3.0.0" });

      expect(v3).toStrictEqual({
        version: "3.0.0",
        data: v1.data,
        projects: [
          {
            id: "main",
            name: "Default project",
            description: "The initial default project",
          },
        ],
        pipelines: [
          {
            id: "pipeline-1",
            project: "main",
            type: "internal",
            configName: "pipeline-1",
            lastModified: "2026-06-04",
          },
          {
            id: "pipeline-2",
            project: "main",
            type: "external",
            path: "/path/to/pipeline-2.json",
            lastModified: "2026-06-04",
            summary: {
              plugins: ["steam"],
              name: "Test Pipeline 2",
              description: "Legacy external pipeline",
            },
          },
        ],
      });
    });

    it("should fallback to default value for corrupted config", async () => {
      const corrupted: any = {
        version: "1.0.0",
        data: null,
      };

      const result = await fileRepoMigrations.migrate(corrupted, { target: "3.0.0" });
      expect(result.version).toBe("3.0.0");
      expect(result.projects).toHaveLength(1);
      expect(result.pipelines).toEqual([]);
    });
  });

  describe("connectionsMigrator", () => {
    it("should initialize default connections", async () => {
      const result = await connectionsMigrator.migrate(undefined, { target: "1.0.0" });
      expect(result).toStrictEqual({
        version: "1.0.0",
        connections: [],
      });
    });
  });

  describe("savedFileMigrator - edge cases", () => {
    it("should normalize unmapped legacy plugin names and typos during migration to 5.0.0", async () => {
      const v4: SavedFileV4 = {
        version: "4.0.0",
        type: "default",
        canvas: {
          blocks: [
            {
              uid: "b1",
              type: "action",
              origin: {
                pluginId: "filesystem",
                nodeId: "copy",
              },
              params: {},
            },
            {
              uid: "b2",
              type: "action",
              origin: {
                pluginId: "dicord",
                nodeId: "send",
              },
              params: {},
            },
            {
              uid: "b3",
              type: "action",
              origin: {
                pluginId: "custom-cool",
                nodeId: "run",
              },
              params: {},
            },
          ],
          triggers: [],
        },
        description: "Edge case plugin names test",
        name: "Edge Case",
        variables: [],
        plugins: {},
      };

      const v5 = await savedFileMigrator.migrate(v4, { target: "5.0.0" });

      expect(v5.canvas.blocks[0].origin.pluginId).toBe("@pipelab/plugin-filesystem");
      expect(v5.canvas.blocks[1].origin.pluginId).toBe("@pipelab/plugin-discord");
      expect(v5.canvas.blocks[2].origin.pluginId).toBe("custom-cool");
    });
  });
});
