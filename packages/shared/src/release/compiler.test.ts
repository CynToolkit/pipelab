import { describe, expect, it } from "vitest";
import { compileWorkflow } from "./compiler";
import type { ReleaseRegistry } from "./types";

const registry: ReleaseRegistry = {
  sources: [{ id: "fake/source", label: "Fake source", output: { kind: "project", technology: "fake", container: "directory" }, createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [{ id: "source", uses: "fake/source", artifacts: { output: { descriptor: { kind: "project", technology: "fake", container: "directory" } } } }], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: { kind: "project", technology: "fake", container: "directory" } } }) }],
  producers: [{ id: "fake/producer", label: "Fake producer", accepts: { kind: "project", technology: "fake" }, targets: [{ id: "windows-x64", label: "Windows", output: { kind: "application", platform: "windows", architecture: "x64", container: "directory" }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [{ id: "build", uses: "fake/build", artifacts: { output: { descriptor: { kind: "application", platform: "windows", architecture: "x64", container: "directory" } } } }], artifacts: { "windows-x64": { reference: { stepId: "build", artifact: "output" }, descriptor: { kind: "application", platform: "windows", architecture: "x64", container: "directory" } } } }) }],
  destinations: [{ id: "fake/destination", label: "Fake destination", accepts: { kind: "application", platform: "windows" }, createDefaultConfig: () => ({}), validate: () => [], compile: (artifact, destination, slot) => [{ id: `delivery-${destination.id}-${slot.id}`, uses: "fake/deliver", needs: [artifact.stepId], artifactInputs: { folder: artifact }, delivery: { destinationId: destination.id, slotId: slot.id, artifact } }] }],
};

describe("generic release compiler", () => {
  it("compiles fake providers without integration-specific knowledge", () => {
    const workflow = compileWorkflow({ version: "3.0.0", id: "release", project: "project", name: "Release", source: { provider: "fake/source", config: {} }, producers: [{ id: "build", provider: "fake/producer", enabled: true, targets: [{ id: "windows-x64", enabled: true, config: {} }], config: {} }], destinations: [{ id: "ship", provider: "fake/destination", enabled: true, config: {}, slots: [{ id: "windows", enabled: true, input: { producerId: "build", outputId: "windows-x64" }, config: {} }] }] }, registry, { host: { platform: "linux", architecture: "x64" } });
    expect(workflow.steps.map((step) => step.uses)).toEqual(["fake/source", "fake/build", "fake/deliver"]);
    expect(workflow.steps[2].artifactInputs?.folder).toEqual({ stepId: "build", artifact: "output" });
  });
});
