import { describe, expect, it } from "vitest";
import { parseConnectionsConfig } from "./connections-definition";

describe("parseConnectionsConfig", () => {
  it("preserves provider-owned fields", () => {
    const value = {
      version: "1.0.0",
      connections: [
        {
          id: "c1",
          pluginName: "provider",
          name: "Account",
          createdAt: "2026-01-01",
          isDefault: false,
          token: "opaque",
        },
      ],
    };
    expect(parseConnectionsConfig(value)).toEqual(value);
  });

  it("rejects unsupported versions and duplicate IDs", () => {
    expect(() => parseConnectionsConfig({ version: "2.0.0", connections: [] })).toThrow(
      "Only connections version 1.0.0",
    );
    expect(() =>
      parseConnectionsConfig({
        version: "1.0.0",
        connections: [
          {
            id: "same",
            pluginName: "provider",
            name: "A",
            createdAt: "2026-01-01",
            isDefault: false,
          },
          {
            id: "same",
            pluginName: "provider",
            name: "B",
            createdAt: "2026-01-01",
            isDefault: false,
          },
        ],
      }),
    ).toThrow("duplicated");
  });

  it("allows the same workflow alias to bind to different Connections in different workflows", () => {
    const config = {
      version: "1.0.0",
      connections: [
        {
          id: "steam-a",
          pluginName: "provider",
          name: "Production",
          createdAt: "2026-01-01",
          isDefault: false,
          username: "prod-user",
        },
        {
          id: "steam-b",
          pluginName: "provider",
          name: "Preview",
          createdAt: "2026-01-02",
          isDefault: false,
          username: "preview-user",
        },
      ],
      workflowBindings: [
        { workflowId: "release-a", alias: "publish", connectionId: "steam-a" },
        { workflowId: "release-b", alias: "publish", connectionId: "steam-b" },
      ],
    };

    expect(parseConnectionsConfig(config)).toEqual(config);
  });

  it("rejects duplicate aliases within one workflow", () => {
    expect(() =>
      parseConnectionsConfig({
        version: "1.0.0",
        connections: [
          {
            id: "steam-a",
            pluginName: "provider",
            name: "Production",
            createdAt: "2026-01-01",
            isDefault: false,
          },
          {
            id: "steam-b",
            pluginName: "provider",
            name: "Preview",
            createdAt: "2026-01-02",
            isDefault: false,
          },
        ],
        workflowBindings: [
          { workflowId: "release-a", alias: "publish", connectionId: "steam-a" },
          { workflowId: "release-a", alias: "publish", connectionId: "steam-b" },
        ],
      }),
    ).toThrow("Workflow 'release-a' has duplicate connection alias 'publish'");
  });

  it("rejects workflow bindings for Connections that do not exist", () => {
    expect(() =>
      parseConnectionsConfig({
        version: "1.0.0",
        connections: [],
        workflowBindings: [{ workflowId: "release-a", alias: "publish", connectionId: "missing" }],
      }),
    ).toThrow("Connection 'missing' does not exist");
  });

  it.each(["steam.release", "steam release", ""])(
    "rejects invalid workflow connection aliases: %j",
    (alias) => {
      expect(() =>
        parseConnectionsConfig({
          version: "1.0.0",
          connections: [
            {
              id: "steam-a",
              pluginName: "provider",
              name: "Production",
              createdAt: "2026-01-01",
              isDefault: false,
            },
          ],
          workflowBindings: [{ workflowId: "release-a", alias, connectionId: "steam-a" }],
        }),
      ).toThrow("alias must start with a letter or underscore");
    },
  );

  it("rejects malformed integration metadata while preserving valid provider fields", () => {
    expect(() =>
      parseConnectionsConfig({
        version: "1.0.0",
        connections: [
          {
            id: "c1",
            pluginName: "provider",
            integrationName: "   ",
            name: "Account",
            createdAt: "2026-01-01",
            isDefault: false,
            token: "opaque",
          },
        ],
      }),
    ).toThrow("integrationName must be a non-empty string");
  });
});
