import { describe, expect, it } from "vitest";
import plugin, { electronWorkflowTaskFactories } from "../../src/index";

describe("Electron Release registry", () => {
  it("keeps the producer and task without legacy node metadata", () => {
    expect("nodes" in plugin).toBe(false);
    expect(plugin.release?.producers?.map((producer) => producer.id)).toContain(
      "@pipelab/plugin-electron/producer",
    );
    expect(Object.keys(electronWorkflowTaskFactories)).toEqual([
      "@pipelab/plugin-electron/electron:package:v2",
    ]);
  });
});
