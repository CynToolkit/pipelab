import { describe, expect, test } from "vitest";
import { bundledPlugins } from "./plugins-registry";

describe("bundledPlugins", () => {
  test("has stable source-owned identities for every statically imported plugin", () => {
    const ids = bundledPlugins.map((plugin) => plugin.id);

    expect(bundledPlugins).toHaveLength(12);
    expect(new Set(ids)).toHaveLength(bundledPlugins.length);

    for (const plugin of bundledPlugins) {
      expect(plugin.id).toMatch(/^@pipelab\/plugin-/);
      expect(plugin.packageName).toBe(plugin.id);
      expect(plugin.name).not.toBe("");
      expect(plugin.nodes.length).toBeGreaterThan(0);
      expect(plugin.isOfficial).toBe(true);
    }
  });
});
