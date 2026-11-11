import { describe, expect, it } from "vitest";
import type { ReleaseConfig } from "@pipelab/shared";
import { withoutUnavailableDestinations } from "./unavailable-destinations";

const config = {
  destinations: [
    {
      id: "cloud",
      provider: "@pipelab/pipelab-cloud/destination",
      enabled: true,
      config: {},
      slots: [],
    },
    {
      id: "steam",
      provider: "@pipelab/plugin-steam/destination",
      enabled: true,
      config: {},
      slots: [],
    },
  ],
} as unknown as ReleaseConfig;

describe("withoutUnavailableDestinations", () => {
  it("disables Pipelab Cloud when no Cloud Worker is configured", () => {
    const result = withoutUnavailableDestinations(config, {});
    expect(result.destinations.map((d) => [d.id, d.enabled])).toEqual([
      ["cloud", false],
      ["steam", true],
    ]);
  });

  it("keeps Pipelab Cloud when a Cloud Worker is configured", () => {
    expect(
      withoutUnavailableDestinations(config, { PIPELAB_CLOUD_WORKER_URL: "https://cloud.example" }),
    ).toBe(config);
  });
});
