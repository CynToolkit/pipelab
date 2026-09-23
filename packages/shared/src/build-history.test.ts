import { describe, expect, it } from "vitest";
import { parseBuildHistoryDocument } from "./build-history";

const entry = {
  id: "run-1",
  pipelineId: "project-1",
  projectName: "Project",
  projectPath: "",
  status: "failed",
  startTime: 1,
  totalSteps: 0,
  completedSteps: 0,
  failedSteps: 0,
  cancelledSteps: 0,
  steps: [] as unknown[],
  logs: [] as unknown[],
  createdAt: 1,
  updatedAt: 1,
};

describe("parseBuildHistoryDocument", () => {
  it("migrates the legacy raw-array format", () => {
    expect(parseBuildHistoryDocument([entry])).toEqual({ version: "1.0.0", entries: [entry] });
  });

  it("rejects malformed entries and unsupported documents", () => {
    expect(() => parseBuildHistoryDocument({ version: "2.0.0", entries: [] })).toThrow(
      "unsupported version",
    );
    expect(() =>
      parseBuildHistoryDocument({ version: "1.0.0", entries: [{ ...entry, status: "unknown" }] }),
    ).toThrow("unsupported value");
  });

  it("rejects malformed persisted artifacts and deliveries", () => {
    const legacyArtifact = {
      id: "artifact-1",
      name: "build.zip",
      path: "/tmp/build.zip",
      size: 12,
      type: "file",
    };
    const runtimeArtifact = {
      id: "runtime-artifact-1",
      path: "/tmp/build.zip",
      stepId: "step-1",
      artifact: "output",
      descriptor: { kind: "files", container: "archive" },
    };
    expect(() =>
      parseBuildHistoryDocument({
        version: "1.0.0",
        entries: [
          {
            ...entry,
            artifacts: [
              { ...runtimeArtifact, descriptor: { kind: "unknown", container: "archive" } },
            ],
          },
        ],
      }),
    ).toThrow("descriptor");
    expect(() =>
      parseBuildHistoryDocument({
        version: "1.0.0",
        entries: [{ ...entry, deliveries: [{ id: "delivery-1", status: "pending" }] }],
      }),
    ).toThrow("delivery");
    expect(
      parseBuildHistoryDocument({
        version: "1.0.0",
        entries: [
          {
            ...entry,
            artifacts: [legacyArtifact],
          },
        ],
      }).entries[0]?.artifacts,
    ).toHaveLength(1);
    expect(
      parseBuildHistoryDocument({
        version: "1.0.0",
        entries: [{ ...entry, artifacts: [runtimeArtifact] }],
      }).entries[0]?.artifacts,
    ).toHaveLength(1);
  });

  it.each([
    ["endTime", "not-a-number"],
    ["duration", "not-a-number"],
    ["output", "not-an-object"],
    ["metadata", "not-an-object"],
  ])("rejects malformed optional history field %s", (field, value) => {
    expect(() =>
      parseBuildHistoryDocument({
        version: "1.0.0",
        entries: [{ ...entry, [field]: value }],
      }),
    ).toThrow(field);
  });

  it.each(["uses", "destinationId", "serviceId", "destinationName", "slotId", "artifact"])(
    "rejects malformed execution step field %s",
    (field) => {
      expect(() =>
        parseBuildHistoryDocument({
          version: "1.0.0",
          entries: [
            {
              ...entry,
              steps: [
                {
                  id: "step",
                  name: "step",
                  status: "pending",
                  startTime: 0,
                  logs: [],
                  [field]: 1,
                },
              ],
            },
          ],
        }),
      ).toThrow(field);
    },
  );

  it.each(["technology", "platform", "architecture", "format"])(
    "rejects malformed artifact descriptor field %s",
    (field) => {
      expect(() =>
        parseBuildHistoryDocument({
          version: "1.0.0",
          entries: [
            {
              ...entry,
              artifacts: [
                {
                  id: "artifact-1",
                  name: "build.zip",
                  path: "/tmp/build.zip",
                  size: 12,
                  type: "file",
                  descriptor: { kind: "files", container: "archive", [field]: 1 },
                },
              ],
            },
          ],
        }),
      ).toThrow(field);
    },
  );
});
