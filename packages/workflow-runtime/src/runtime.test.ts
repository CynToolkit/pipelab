import { describe, expect, it } from "vitest";
import { runWorkflow, type WorkflowHost } from "./index";

const host: WorkflowHost = { workspace: { root: "/tmp" }, filesystem: { ensureDirectory: async () => undefined }, processes: { execute: async () => ({ exitCode: 0, stdout: "", stderr: "", duration: 0 }) }, logger: { info: () => undefined, warn: () => undefined, error: () => undefined } };

describe("artifact-aware workflow runtime", () => {
  it("materializes declared artifact descriptors without a global registry", async () => {
    const workflow = { version: 1, steps: [{ id: "build", uses: "test:build", artifacts: { output: { descriptor: { kind: "application", platform: "windows" } } } }, { id: "deliver", uses: "test:deliver", needs: ["build"], delivery: { destinationId: "folder", slotId: "windows", artifact: { stepId: "build", artifact: "output" } } }] } as const;
    let deliveredPath = "";
    const result = await runWorkflow(workflow, { host, tasks: { "test:build": async ({ setArtifact }) => { setArtifact("output", "/tmp/game"); }, "test:deliver": async ({ delivery }) => { deliveredPath = delivery!.artifact.path; } } });
    expect(deliveredPath).toBe("/tmp/game");
    expect(result.artifacts).toEqual([expect.objectContaining({ descriptor: { kind: "application", platform: "windows" }, stepId: "build", artifact: "output", path: "/tmp/game" })]);
  });
});
