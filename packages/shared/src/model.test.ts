import { describe, expect, it } from "vitest";
import { SavedFileV1, SavedFileV2, SavedFileV3, SavedFileV4, SavedFileV5 } from "./model";
import {
  savedFileMigrator,
  normalizePipelineConfig,
  appSettingsMigrator,
} from "./config/migrators";
import { AppConfigV6, AppConfigV8 } from "./config.schema";

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

  it("should migrate AppConfigV6 to AppConfigV8", async () => {
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

    const v8 = await appSettingsMigrator.migrate(v6, { target: "8.0.0" });

    expect(v8).toStrictEqual({
      version: "8.0.0",
      theme: "dark",
      locale: "fr-FR",
      tours: {
        dashboard: { step: 1, completed: true },
        editor: { step: 2, completed: false },
      },
      autosave: false,
      agents: [],
      buildHistory: {
        retentionPolicy: {
          enabled: false,
          maxEntries: 50,
          maxAge: 30,
        },
      },
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
});
