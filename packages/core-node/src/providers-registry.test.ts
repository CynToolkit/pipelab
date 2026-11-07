import { describe, expect, it } from "vitest";
import { matchesArtifact } from "@pipelab/shared";
import type { CompiledArtifact, ReleaseCompileContext } from "@pipelab/shared";
import { builtInProviders } from "./providers-registry";

const context: ReleaseCompileContext = {
  host: { platform: "linux", architecture: "x64" },
};

const producerContext: ReleaseCompileContext = {
  ...context,
  sourceConfig: { path: "/game.c3p", profilePath: "/profile" },
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
              producerContext,
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
                    input:
                      destination.id === "@pipelab/pipelab-cloud/destination"
                        ? {
                            producerId: "provider-registry-test",
                            outputId: "provider-registry-test",
                          }
                        : { source: true },
                    config: {},
                  },
                ],
              },
              {
                id: "provider-registry-test",
                enabled: true,
                input:
                  destination.id === "@pipelab/pipelab-cloud/destination"
                    ? { producerId: "provider-registry-test", outputId: "provider-registry-test" }
                    : { source: true },
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
      "@pipelab/pipelab-cloud",
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
      "@pipelab/plugin-construct/producer",
      "@pipelab/plugin-electron/producer",
      "@pipelab/plugin-godot/producer",
      "@pipelab/plugin-tauri/producer",
    ]);
    expect(contributedIds("destinations")).toEqual([
      "@pipelab/pipelab-cloud/destination",
      "@pipelab/plugin-itch/destination",
      "@pipelab/plugin-poki/destination",
      "@pipelab/plugin-steam/destination",
    ]);
  });
});

describe("Construct outputs in destinations and producers", () => {
  const producers = builtInProviders.flatMap((provider) => provider.release?.producers ?? []);
  const constructProducer = producers.find(
    (producer) => producer.id === "@pipelab/plugin-construct/producer",
  );
  const destinations = builtInProviders.flatMap((provider) => provider.release?.destinations ?? []);

  it("accepts the Construct web output in the Electron, Tauri and Poki web consumers", () => {
    const webOutput = constructProducer?.targets.find((target) => target.id === "web")?.output;
    expect(webOutput).toBeDefined();
    for (const producerId of [
      "@pipelab/plugin-electron/producer",
      "@pipelab/plugin-tauri/producer",
    ]) {
      const accepts = producers.find((producer) => producer.id === producerId)?.accepts;
      expect(matchesArtifact(webOutput!, accepts!)).toBe(true);
    }
    const pokiAccepts = destinations.find(
      (item) => item.id === "@pipelab/plugin-poki/destination",
    )?.accepts;
    expect(matchesArtifact(webOutput!, pokiAccepts!)).toBe(true);
  });

  it("routes Construct desktop outputs to Steam and Itch but not to Poki", () => {
    const constructOutputs =
      constructProducer?.targets
        .filter((target) => target.buildType === "desktop")
        .map((target) => target.output) ?? [];
    expect(constructOutputs).toHaveLength(3);
    const acceptsAll = (destinationId: string) =>
      constructOutputs.every((output) =>
        matchesArtifact(output!, destinations.find((item) => item.id === destinationId)!.accepts),
      );
    expect(acceptsAll("@pipelab/plugin-steam/destination")).toBe(true);
    expect(acceptsAll("@pipelab/plugin-itch/destination")).toBe(true);
    expect(acceptsAll("@pipelab/plugin-poki/destination")).toBe(false);
  });
});
