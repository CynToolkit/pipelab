import { describe, expect, test } from "vitest";
import { toRendererProviderMetadata } from "./utils";
import type { RendererProviderMetadata } from "@pipelab/shared";

describe("toRendererProviderMetadata", () => {
  test("keeps renderer metadata and omits legacy node definitions", () => {
    const release = { sources: [] };
    const plugin: RendererProviderMetadata & { nodes: unknown[] } = {
      id: "@pipelab/plugin-example",
      name: "Example",
      icon: { type: "image", image: "file:///tmp/plugin.png" },
      description: "Example plugin",
      isOfficial: true,
      packageName: "@pipelab/plugin-example",
      integrations: [{ name: "Example", fields: [] }],
      release,
      nodes: [{ node: { id: "legacy-node" }, runner: () => undefined }],
    };

    const metadata = toRendererProviderMetadata(plugin);

    expect(metadata).toEqual({
      id: plugin.id,
      name: plugin.name,
      icon: {
        type: "image",
        image: "http://localhost:33753/media-file/%2Ftmp%2Fplugin.png",
      },
      description: plugin.description,
      isOfficial: plugin.isOfficial,
      packageName: plugin.packageName,
      integrations: plugin.integrations,
      release,
    });
    expect(metadata).not.toHaveProperty("nodes");
  });
});
