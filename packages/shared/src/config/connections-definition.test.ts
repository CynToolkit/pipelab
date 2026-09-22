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
});
