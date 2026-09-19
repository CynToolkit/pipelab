import { describe, expect, it } from "vitest";
import { compileWorkflow } from "./workflow-compiler";
import type { ReleaseCatalog } from "@pipelab/shared";

const catalog: ReleaseCatalog = {
  sources: [{ id: "fake/source", label: "Fake source", output: { kind: "project", technology: "fake" }, createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [{ id: "source", uses: "fake/source", artifacts: { output: { descriptor: { kind: "project", technology: "fake" } } } }], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: { kind: "project", technology: "fake" } } }) }],
  producers: [{ id: "fake/producer", label: "Fake producer", accepts: { kind: "project", technology: "fake" }, targets: [{ id: "windows-x64", label: "Windows", output: { kind: "application", platform: "windows", architecture: "x64" }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [{ id: "build", uses: "fake/build", artifacts: { output: { descriptor: { kind: "application", platform: "windows", architecture: "x64" } } } }], artifacts: { "windows-x64": { reference: { stepId: "build", artifact: "output" }, descriptor: { kind: "application", platform: "windows", architecture: "x64" } } } }) }],
  destinations: [{ id: "fake/destination", label: "Fake destination", accepts: { kind: "application", platform: "windows" }, createDefaultConfig: () => ({}), validate: () => [], compile: (artifact, destination, slot) => [{ id: `delivery-${destination.id}-${slot.id}`, uses: "fake/deliver", needs: [artifact.stepId], delivery: { destinationId: destination.id, slotId: slot.id, artifact } }] }],
};

describe("generic release compiler", () => {
  it("compiles fake providers without integration-specific knowledge", () => {
    const workflow = compileWorkflow({ version: "3.0.0", id: "release", project: "project", name: "Release", source: { provider: "fake/source", config: {} }, producers: [{ id: "build", provider: "fake/producer", enabled: true, targets: [{ id: "windows-x64", enabled: true, config: {} }], config: {} }], destinations: [{ id: "ship", provider: "fake/destination", enabled: true, config: {}, slots: [{ id: "windows", enabled: true, input: { producerId: "build", outputId: "windows-x64" }, config: {} }] }] }, catalog, { host: { platform: "linux", architecture: "x64" } });
    expect(workflow.steps.map((step) => step.uses)).toEqual(["fake/source", "fake/build", "fake/deliver"]);
    expect(workflow.steps[2].delivery?.artifact).toEqual({ stepId: "build", artifact: "output" });
  });
});
