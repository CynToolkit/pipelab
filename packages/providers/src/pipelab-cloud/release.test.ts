import { describe, expect, it } from "vitest";
import provider, { PIPELAB_CLOUD_UPLOAD_TASK_ID, pipelabCloudDestination } from "./index";

describe("Pipelab Cloud Release destination", () => {
  it("routes the selected build target through the shared Cloud upload task", () => {
    const steps = pipelabCloudDestination.compile(
      {
        reference: { stepId: "build-windows", artifact: "windows" },
        descriptor: { kind: "application", container: "directory", platform: "windows" },
      },
      {
        id: "cloud",
        provider: pipelabCloudDestination.id,
        enabled: true,
        config: {},
        slots: [],
      },
      {
        id: "windows-slot",
        enabled: true,
        config: {},
        input: { producerId: "desktop-profile", outputId: "windows-x64" },
      },
      { host: { platform: "linux", architecture: "x64" } },
    );

    expect(steps).toEqual([
      expect.objectContaining({
        uses: PIPELAB_CLOUD_UPLOAD_TASK_ID,
        artifactInputs: { input: { stepId: "build-windows", artifact: "windows" } },
        with: { buildProfileId: "desktop-profile", buildTargetId: "windows-x64" },
        delivery: {
          destinationId: "cloud",
          slotId: "windows-slot",
          artifact: { stepId: "build-windows", artifact: "windows" },
        },
      }),
    ]);
  });

  it("is registered as a first-class provider destination", () => {
    expect(provider.release?.destinations).toContain(pipelabCloudDestination);
  });
});
