import { describe, expect, it } from "vitest";
import { getReleaseHostCapabilities } from "@pipelab/shared";
import { getWorkflowReadiness } from "./release-flow-readiness";

const capabilities = getReleaseHostCapabilities({ platform: "linux", architecture: "x64" });

const webWorkflow = (source: { type: "folder" | "construct3"; path: string; profilePath?: string }) => ({
  version: "2.0.0" as const,
  id: "workflow",
  project: "main",
  name: "Test workflow",
  source,
  packagers: [
    { id: "web", definitionId: "web" as const, name: "Web", enabled: true, config: { targets: ["web.html5"] } },
  ],
  destinations: [
    {
      id: "web-folder",
      serviceId: "web-folder" as const,
      enabled: true,
      config: {},
      slots: [
        {
          id: "web-slot",
          enabled: true,
          config: { outputDir: "/tmp/export" },
          input: { packagerId: "web", outputId: "web.html5" as const },
        },
      ],
    },
  ],
});

describe("getWorkflowReadiness", () => {
  it("reports the missing Construct 3 browser profile", () => {
    const errors = getWorkflowReadiness(webWorkflow({ type: "construct3", path: "/tmp/game.c3p" }), capabilities, []);

    expect(errors).toContain("Choose a usable browser profile in Source settings");
  });

  it("accepts a configured web-folder workflow", () => {
    const errors = getWorkflowReadiness(webWorkflow({ type: "folder", path: "/tmp/build" }), capabilities, []);

    expect(errors).toEqual([]);
  });

  it("reports an unusable discovered browser profile", () => {
    const errors = getWorkflowReadiness(
      webWorkflow({ type: "construct3", path: "/tmp/game.c3p", profilePath: "/tmp/profile" }),
      capabilities,
      [],
      "The selected browser profile is unavailable or locked: /tmp/profile",
    );

    expect(errors).toContain("The selected browser profile is unavailable or locked: /tmp/profile");
  });
});
