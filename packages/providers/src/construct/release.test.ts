import { describe, expect, it } from "vitest";
import plugin, { constructSource } from "./index";

describe("Construct release validation", () => {
  it("declares the provider-owned Construct Account Connection schema", () => {
    expect(plugin.integrations).toContainEqual({
      name: "Construct Account",
      fields: [
        { key: "username", label: "Username", type: "text" },
        { key: "password", label: "Password", type: "password" },
      ],
    });
    expect(constructSource.fields).toContainEqual(
      expect.objectContaining({
        key: "accountConnectionId",
        type: "connection",
        integration: "Construct Account",
        required: false,
      }),
    );
    expect(constructSource.createDefaultConfig()).toHaveProperty("accountConnectionId", "");
  });

  it("keeps the Release source and workflow task without legacy node metadata", () => {
    expect("nodes" in plugin).toBe(false);
    expect(plugin.release?.sources?.map((source) => source.id)).toContain(constructSource.id);
    expect(Object.keys(plugin.workflowTasks ?? {})).toEqual([
      "@pipelab/plugin-construct/export-construct-project",
    ]);
  });

  it("reports source field paths", () => {
    expect(constructSource.validate({})).toEqual([
      expect.objectContaining({ path: "path" }),
      expect.objectContaining({ path: "profilePath" }),
    ]);
  });
});
