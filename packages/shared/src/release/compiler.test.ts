import { describe, expect, it } from "vitest";
import { compileWorkflow } from "./compiler";
import type { ReleaseRegistry } from "./types";

const registry: ReleaseRegistry = {
  sources: [{ id: "fake/source", label: "Fake source", output: { kind: "project", technology: "fake", container: "directory" }, createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [{ id: "source", uses: "fake/source", artifacts: { output: { descriptor: { kind: "project", technology: "fake", container: "directory" } } } }], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: { kind: "project", technology: "fake", container: "directory" } } }) }],
  producers: [{ id: "fake/producer", label: "Fake producer", accepts: { kind: "project", technology: "fake" }, targets: [{ id: "windows-x64", label: "Windows", output: { kind: "application", platform: "windows", architecture: "x64", container: "directory" }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: (input) => ({ steps: [{ id: "build", uses: "fake/build", needs: [input.reference.stepId], artifactInputs: { input: input.reference }, artifacts: { output: { descriptor: { kind: "application", platform: "windows", architecture: "x64", container: "directory" } } } }], artifacts: { "windows-x64": { reference: { stepId: "build", artifact: "output" }, descriptor: { kind: "application", platform: "windows", architecture: "x64", container: "directory" } } } }) }],
  destinations: [{ id: "fake/destination", label: "Fake destination", accepts: { kind: "application", platform: "windows" }, createDefaultConfig: () => ({}), validate: () => [], compile: (artifact, destination, slot) => [{ id: `delivery-${destination.id}-${slot.id}`, uses: "fake/deliver", needs: [artifact.reference.stepId], artifactInputs: { folder: artifact.reference }, delivery: { destinationId: destination.id, slotId: slot.id, artifact: artifact.reference } }] }],
};

describe("generic release compiler", () => {
  it("compiles fake providers without integration-specific knowledge", () => {
    const workflow = compileWorkflow({ version: "3.0.0", id: "release", project: "project", name: "Release", source: { provider: "fake/source", config: {} }, producers: [{ id: "build", provider: "fake/producer", enabled: true, targets: [{ id: "windows-x64", enabled: true, config: {} }], config: {} }], destinations: [{ id: "ship", provider: "fake/destination", enabled: true, config: {}, slots: [{ id: "windows", enabled: true, input: { producerId: "build", outputId: "windows-x64" }, config: {} }] }] }, registry, { host: { platform: "linux", architecture: "x64" } });
    expect(workflow.steps.map((step) => step.uses)).toEqual(["fake/source", "fake/build", "fake/deliver"]);
    expect(workflow.steps[2].artifactInputs?.folder).toEqual({ stepId: "build", artifact: "output" });
  });

  it("orders explicitly chained producers and propagates descriptors", () => {
    const chainRegistry: ReleaseRegistry = {
      sources: registry.sources,
      producers: [
        { id: "fake/a", label: "A", accepts: { kind: "project", technology: "fake" }, targets: [{ id: "app", label: "App", output: { kind: "application", platform: "web", container: "directory" }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: (input) => ({ steps: [{ id: "a", uses: "fake/a", needs: [input.reference.stepId], artifactInputs: { input: input.reference }, artifacts: { output: { descriptor: { kind: "application", platform: "web", container: "directory" } } } }], artifacts: { app: { reference: { stepId: "a", artifact: "output" }, descriptor: { kind: "application", platform: "web", container: "directory" } } } }) },
        { id: "fake/b", label: "B", accepts: { kind: "application", platform: "web", container: "directory" }, targets: [{ id: "archive", label: "Archive", output: { kind: "files", container: "archive", format: "zip" }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: (input) => ({ steps: [{ id: "b", uses: "fake/b", needs: [input.reference.stepId], artifactInputs: { input: input.reference }, artifacts: { output: { descriptor: { kind: "files", container: "archive", format: "zip" } } } }], artifacts: { archive: { reference: { stepId: "b", artifact: "output" }, descriptor: { kind: "files", container: "archive", format: "zip" } } } }) },
      ],
      destinations: [{ id: "fake/archive-destination", label: "Archive deploy", accepts: { kind: "files", container: "archive", format: "zip" }, createDefaultConfig: () => ({}), validate: () => [], compile: (artifact) => [{ id: "deploy", uses: "fake/deploy", needs: [artifact.reference.stepId], artifactInputs: { input: artifact.reference } }] }],
    };
    const workflow = compileWorkflow({ version: "3.0.0", id: "chain", project: "project", name: "Chain", source: { provider: "fake/source", config: {} }, producers: [{ id: "b", provider: "fake/b", enabled: true, input: { producerId: "a", outputId: "app" }, targets: [{ id: "archive", enabled: true, config: {} }], config: {} }, { id: "a", provider: "fake/a", enabled: true, input: { source: true }, targets: [{ id: "app", enabled: true, config: {} }], config: {} }], destinations: [{ id: "deploy", provider: "fake/archive-destination", enabled: true, config: {}, slots: [{ id: "archive", enabled: true, input: { producerId: "b", outputId: "archive" }, config: {} }] }] }, chainRegistry, { host: { platform: "linux", architecture: "x64" } });
    expect(workflow.steps.map((step) => step.id)).toEqual(["source", "a", "b", "deploy"]);
    expect(workflow.steps[2].artifactInputs?.input).toEqual({ stepId: "a", artifact: "output" });
  });

  it("allows a destination to consume the source directly", () => {
    const directRegistry: ReleaseRegistry = { ...registry, destinations: [{ id: "direct", label: "Direct", accepts: { kind: "project", technology: "fake" }, createDefaultConfig: () => ({}), validate: () => [], compile: (artifact) => [{ id: "direct-deploy", uses: "fake/direct", needs: [artifact.reference.stepId], artifactInputs: { input: artifact.reference } }] }] };
    const workflow = compileWorkflow({ version: "3.0.0", id: "direct", project: "project", name: "Direct", source: { provider: "fake/source", config: {} }, producers: [], destinations: [{ id: "deploy", provider: "direct", enabled: true, config: {}, slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }] }] }, directRegistry, { host: { platform: "linux", architecture: "x64" } });
    expect(workflow.steps.map((step) => step.id)).toEqual(["source", "direct-deploy"]);
  });
});
