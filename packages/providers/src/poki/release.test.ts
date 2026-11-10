import { describe, expect, it } from "vitest";
import pokiPlugin, { createPokiUploadTask, WORKFLOW_TASK_ID } from "./index";

describe("Poki Release registry", () => {
  it("keeps the destination and task without legacy node metadata", () => {
    expect("nodes" in pokiPlugin).toBe(false);
    expect(pokiPlugin.release?.destinations?.map((destination) => destination.id)).toContain(
      "@pipelab/plugin-poki/destination",
    );
    expect(createPokiUploadTask).toBeTypeOf("function");
    expect(WORKFLOW_TASK_ID).toBe("@pipelab/plugin-poki/poki-upload");
    expect(Object.keys(pokiPlugin.workflowTasks ?? {})).toEqual([WORKFLOW_TASK_ID]);
  });

  it("takes the version name and notes from the release details", () => {
    const destination = pokiPlugin.release?.destinations?.[0];
    const artifact = { reference: { stepId: "build" } } as never;
    const target = { id: "d", config: { project: "game" }, slots: [] } as never;
    const slot = { id: "s", config: {} } as never;
    const compile = (variables: Record<string, unknown>) =>
      destination?.compile(artifact, target, slot, { host: {}, variables } as never)[0].with;
    expect(compile({ version: "1.2.0", releaseNotes: "Fixes" })).toMatchObject({
      project: "game",
      name: "1.2.0",
      notes: "Fixes",
    });
    expect(compile({ version: "1.2.0", releaseNotes: " " })).toMatchObject({ notes: "1.2.0" });
  });
});
