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
});
