import { describe, expect, test } from "vitest";
import { enhancePluginDefinition } from "./plugins-registry";

describe("enhancePluginDefinition", () => {
  test("keeps the bundled package name when its package directory is unavailable", async () => {
    const plugin = await enhancePluginDefinition(
      { nodes: [] },
      "",
      "@pipelab/plugin-discord",
    );

    expect(plugin.id).toBe("@pipelab/plugin-discord");
    expect(plugin.packageName).toBe("@pipelab/plugin-discord");
    expect(plugin.isOfficial).toBe(true);
  });
});
