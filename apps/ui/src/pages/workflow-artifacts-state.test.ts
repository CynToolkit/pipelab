import type { BuildHistoryEntry } from "@pipelab/shared";
import { describe, expect, it } from "vitest";
import { aggregateWorkflowArtifacts } from "./workflow-artifacts-state";

const run = (
  values: Pick<BuildHistoryEntry, "id" | "workflowId" | "pipelineId" | "startTime" | "artifacts"> &
    Partial<BuildHistoryEntry>,
): BuildHistoryEntry => ({
  projectName: "Project",
  status: "completed",
  steps: [],
  totalSteps: 0,
  completedSteps: 0,
  failedSteps: 0,
  cancelledSteps: 0,
  logs: [],
  createdAt: values.startTime,
  updatedAt: values.startTime,
  ...values,
});

describe("aggregateWorkflowArtifacts", () => {
  it("flattens only the selected workflow and project and sorts runs newest first", () => {
    const entries = [
      run({
        id: "older-run",
        workflowId: "flow-1",
        pipelineId: "project-1",
        startTime: 10,
        version: "1.0.0",
        artifacts: [
          {
            id: "old-artifact",
            name: "old.zip",
            path: "/artifacts/old.zip",
            size: 12,
            type: "file",
          },
        ],
      }),
      run({
        id: "wrong-project",
        workflowId: "flow-1",
        pipelineId: "project-2",
        startTime: 30,
        artifacts: [
          {
            id: "wrong-project-artifact",
            name: "ignore",
            path: "/artifacts/ignore",
            size: 1,
            type: "file",
          },
        ],
      }),
      run({
        id: "newer-run",
        workflowId: "flow-1",
        pipelineId: "project-1",
        startTime: 20,
        version: "2.0.0",
        artifacts: [
          {
            id: "new-artifact",
            descriptor: {
              kind: "application",
              platform: "windows",
              architecture: "x64",
              container: "archive",
              format: "zip",
            },
            path: "/artifacts/new.zip",
            stepId: "package",
            artifact: "windows-package",
            size: 42,
            cloud: { hostedArtifactId: "hosted-1", uploadedAt: "2026-09-01T00:00:00Z" },
          },
        ],
      }),
      run({
        id: "wrong-workflow",
        workflowId: "flow-2",
        pipelineId: "project-1",
        startTime: 40,
        artifacts: [
          {
            id: "wrong-workflow-artifact",
            name: "ignore",
            path: "/artifacts/ignore",
            size: 1,
            type: "file",
          },
        ],
      }),
    ];

    const artifacts = aggregateWorkflowArtifacts(entries, "flow-1", "project-1");

    expect(artifacts.map((artifact) => artifact.runId)).toEqual(["newer-run", "older-run"]);
    expect(artifacts[0]).toMatchObject({
      id: "newer-run:new-artifact",
      runId: "newer-run",
      runDate: 20,
      releaseVersion: "2.0.0",
      displayName: "windows-package",
      platform: "windows",
      architecture: "x64",
      format: "zip",
      kind: "application",
      size: 42,
      localPath: "/artifacts/new.zip",
      hostedArtifactId: "hosted-1",
    });
  });

  it("uses only persisted names and descriptors instead of parsing filenames", () => {
    const [artifact] = aggregateWorkflowArtifacts(
      [
        run({
          id: "run-1",
          workflowId: "flow-1",
          pipelineId: "project-1",
          startTime: 10,
          artifacts: [
            {
              id: "legacy",
              name: "windows-x64-installer.dmg",
              path: "/artifacts/windows-x64-installer.dmg",
              size: 7,
              type: "file",
            },
          ],
        }),
      ],
      "flow-1",
      "project-1",
    );

    expect(artifact).toMatchObject({ displayName: "windows-x64-installer.dmg", kind: "file" });
    expect(artifact).not.toHaveProperty("platform");
    expect(artifact).not.toHaveProperty("architecture");
    expect(artifact).not.toHaveProperty("format");
  });
});
