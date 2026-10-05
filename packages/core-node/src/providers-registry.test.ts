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
