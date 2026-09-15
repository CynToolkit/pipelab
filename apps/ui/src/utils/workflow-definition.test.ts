import { describe, expect, it } from "vitest";
import { createWorkflowDefinition } from "./workflow-definition";

describe("createWorkflowDefinition", () => {
  it("connects source export, pre-bundling, bundle, and parallel uploads", () => {
    const workflow = createWorkflowDefinition({
      sourceType: "c3p",
      packageProject: true,
      targets: {
        steam: {
          sdk: "/steam/sdk",
          username: "builder",
          appId: "123",
          depotId: "456",
          description: "build",
        },
        itch: {
          project: "owner/game",
          apiKey: "secret",
          channel: "windows",
        },
      },
    });

    expect(workflow.steps.map((step) => step.id)).toEqual([
      "source-export",
      "prebundle",
      "bundle",
      "steam",
      "itch",
    ]);
    expect(workflow.steps[1].with).toEqual({
      file: "${{ steps.source-export.outputs.zipFile }}",
    });
    expect(workflow.steps[3].needs).toEqual(["bundle"]);
    expect(workflow.steps[4].needs).toEqual(["bundle"]);
    expect(workflow.steps[3].with).toMatchObject({
      folder: "${{ steps.bundle.outputs.bundleDirectory }}",
      appId: "123",
    });
    expect(workflow.steps[4].with).toMatchObject({
      "input-folder": "${{ steps.bundle.outputs.bundleDirectory }}",
      user: "owner",
      project: "game",
    });
  });

  it("can stop after pre-bundling when packaging is disabled", () => {
    const workflow = createWorkflowDefinition({
      sourceType: "folder",
      packageProject: false,
      targets: {},
    });

    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0]).toMatchObject({
      uses: "construct:export-folder",
      with: { folder: "${{ variables.sourcePath }}" },
    });
  });
});
