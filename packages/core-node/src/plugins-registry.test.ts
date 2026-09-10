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

  test("uses static metadata without resolving a package directory", async () => {
    const plugin = await enhancePluginDefinition(
      { nodes: [] },
      "",
      "@pipelab/plugin-construct",
      {
        name: "Construct",
        description: "Construct plugin",
        icon: "./dist/assets/construct.webp",
      },
    );

    expect(plugin.name).toBe("Construct");
    expect(plugin.description).toBe("Construct plugin");
    expect(plugin.icon).toEqual({ type: "icon", icon: "pi pi-box" });
  });
});
