import { describe, expect, it } from "vitest";
import type { BuildHistoryEntry } from "@pipelab/shared";
import { applyRetention } from "./apply-retention";

const DAY = 24 * 60 * 60 * 1000;
const run = (id: string, ageDays: number) =>
  ({
    id,
    workflowId: "wf",
    status: "completed",
    createdAt: Date.now() - ageDays * DAY,
    artifacts: [{ id: `${id}-a` }],
  }) as unknown as BuildHistoryEntry;

const fakeHistory = (entries: BuildHistoryEntry[]) => {
  const calls: string[] = [];
  return {
    calls,
    getByProject: async () => entries,
    deleteWithArtifacts: async (id: string) => void calls.push(`run:${id}`),
    deleteArtifacts: async (id: string) => void calls.push(`files:${id}`),
  };
};

describe("applyRetention", () => {
  const entries = [run("new", 1), run("mid", 2), run("old", 3), run("older", 4)];

  it("does nothing without a policy", async () => {
    const history = fakeHistory(entries);
    expect(
      await applyRetention(history, { projectId: "p", workflowId: "wf", policy: undefined }),
    ).toEqual({
      runs: 0,
      files: 0,
    });
    expect(history.calls).toEqual([]);
  });

  it("deletes runs and artifact files per the policy and reports the counts", async () => {
    const history = fakeHistory(entries);
    const result = await applyRetention(history, {
      projectId: "p",
      workflowId: "wf",
      policy: { history: { maxRuns: 3 }, artifacts: { maxRuns: 2 } },
    });
    expect(result).toEqual({ runs: 1, files: 1 });
    expect(history.calls).toEqual(["run:older", "files:old"]);
  });
});
