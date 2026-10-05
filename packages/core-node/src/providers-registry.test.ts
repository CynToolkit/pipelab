import { describe, expect, it } from "vitest";
import type { CompiledArtifact, ReleaseCompileContext } from "@pipelab/shared";
import { builtInProviders } from "./providers-registry";

const context: ReleaseCompileContext = {
  host: { platform: "linux", architecture: "x64" },
};

const input: CompiledArtifact = {
  reference: { stepId: "provider-registry-test", artifact: "output" },
  descriptor: { kind: "application", platform: "web", container: "directory" },
};

describe("built-in provider Release task factories", () => {
  it("provides a workflow task factory for every task ID emitted by each provider", () => {
    for (const provider of builtInProviders) {
      const taskIds = new Set(Object.keys(provider.workflowTasks ?? {}));
      const emittedTaskIds = [
        ...(provider.release?.sources ?? []).flatMap((source) =>
          source.compile(source.createDefaultConfig(), context).steps.map((step) => step.uses),
        ),
        ...(provider.release?.producers ?? []).flatMap((producer) =>
          producer
            .compile(
              input,
              {
                id: "provider-registry-test",
                provider: producer.id,
                enabled: true,
                targets: producer.targets.map((target) => ({
                  id: target.id,
                  enabled: true,
                  config: target.createDefaultConfig(),
                })),
                config: producer.createDefaultConfig(),
              },
              context,
            )
            .steps.map((step) => step.uses),
        ),
        ...(provider.release?.destinations ?? []).flatMap((destination) =>
          destination
            .compile(
              input,
              {
                id: "provider-registry-test",
                provider: destination.id,
                enabled: true,
                config: destination.createDefaultConfig(),
                slots: [
                  {
                    id: "provider-registry-test",
                    enabled: true,
                    input: { source: true },
                    config: {},
                  },
                ],
              },
              {
                id: "provider-registry-test",
                enabled: true,
                input: { source: true },
                config: {},
              },
              context,
            )
            .map((step) => step.uses),
        ),
      ];

      for (const taskId of emittedTaskIds) {
        if (taskId.startsWith(`${provider.id}/`)) {
          expect(taskIds.has(taskId), `${provider.id} emits ${taskId}`).toBe(true);
        }
      }
    }
  });
});

describe("provider compatibility and composition", () => {
  it("retains all built-in provider and Workflow task IDs", async () => {
    const { createBuiltInWorkflowTaskFactories } = await import("./workflow-tasks/registry");
    expect(builtInProviders.map((provider) => provider.id).sort()).toEqual([
      "@pipelab/plugin-construct",
      "@pipelab/plugin-electron",
      "@pipelab/plugin-godot",
      "@pipelab/plugin-itch",
      "@pipelab/plugin-poki",
      "@pipelab/plugin-steam",
      "@pipelab/plugin-tauri",
    ]);
    expect(Object.keys(createBuiltInWorkflowTaskFactories()).sort()).toEqual([
      "@pipelab/plugin-construct/export-construct-project",
      "@pipelab/plugin-electron/electron:package:v2",
      "@pipelab/plugin-godot/godot:export",
      "@pipelab/plugin-itch/itch-upload",
      "@pipelab/plugin-poki/poki-upload",
      "@pipelab/plugin-steam/steam-upload",
      "@pipelab/plugin-tauri/tauri:package:v2",
    ]);
  });
  it("derives metadata and Release definitions directly from the same list", async () => {
    const { getProviderMetadata } = await import("./utils");
    const { buildCoreReleaseRegistry } = await import("./release/registry");
    const metadata = getProviderMetadata();
    expect(metadata.map((provider) => provider.id)).toEqual(
      builtInProviders.map((provider) => provider.id),
    );
    expect(metadata.every((provider) => !Object.hasOwn(provider, "workflowTasks"))).toBe(true);
    const registry = buildCoreReleaseRegistry();
    const contributedIds = (kind: "sources" | "producers" | "destinations") =>
      builtInProviders
        .flatMap((provider) => provider.release?.[kind]?.map((definition) => definition.id) ?? [])
        .sort();
    for (const kind of ["sources", "producers", "destinations"] as const) {
      expect(
        registry[kind]
          .filter((definition) => !definition.id.startsWith("@pipelab/core/"))
          .map((definition) => definition.id)
          .sort(),
      ).toEqual(contributedIds(kind));
    }
    expect(contributedIds("sources")).toEqual([
      "@pipelab/plugin-construct/source",
      "@pipelab/plugin-godot/source",
    ]);
    expect(contributedIds("producers")).toEqual([
      "@pipelab/plugin-electron/producer",
      "@pipelab/plugin-godot/producer",
      "@pipelab/plugin-tauri/producer",
    ]);
    expect(contributedIds("destinations")).toEqual([
      "@pipelab/plugin-itch/destination",
      "@pipelab/plugin-poki/destination",
      "@pipelab/plugin-steam/destination",
    ]);
  });
});
