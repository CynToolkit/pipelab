import { describe, expect, it } from "vitest";
import pokiPlugin, { workflowTaskRunners } from "./index";

describe("Poki Release registry", () => {
  it("keeps the destination and task after removing legacy nodes", () => {
    expect(pokiPlugin.nodes).toEqual([]);
    expect(pokiPlugin.release?.destinations?.map((destination) => destination.id)).toContain(
      "@pipelab/plugin-poki/destination",
    );
    expect(Object.keys(workflowTaskRunners)).toEqual(["@pipelab/plugin-poki/poki-upload"]);
  });
});
