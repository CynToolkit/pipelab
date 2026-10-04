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
  });
});
