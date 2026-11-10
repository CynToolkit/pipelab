import { describe, expect, it } from "vitest";
import type { BuildHistoryEntry } from "../build-history";
import { planRetention } from "./retention";

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const run = (id: string, ageDays: number, extra: Partial<BuildHistoryEntry> = {}) =>
  ({
    id,
    workflowId: "wf",
    status: "completed",
    createdAt: now - ageDays * DAY,
    artifacts: [{ id: `${id}-artifact` }],
    ...extra,
  }) as unknown as BuildHistoryEntry;
const ids = (entries: BuildHistoryEntry[]) => entries.map((entry) => entry.id);
const plan = (
  entries: BuildHistoryEntry[],
  policy: Parameters<typeof planRetention>[1]["policy"],
) => planRetention(entries, { workflowId: "wf", keepId: "current", policy, now });

const runs = [run("current", 0), run("a", 1), run("b", 2), run("c", 3), run("d", 40)];

describe("planRetention", () => {
  it("does nothing without a policy or rules", () => {
    expect(plan(runs, undefined)).toEqual({ deleteRuns: [], deleteArtifacts: [] });
    expect(plan(runs, {})).toEqual({ deleteRuns: [], deleteArtifacts: [] });
  });

  it("counts the run that just finished toward the history limit", () => {
    expect(ids(plan(runs, { history: { maxRuns: 2 } }).deleteRuns)).toEqual(["b", "c", "d"]);
  });

  it("drops runs older than the history age", () => {
    expect(ids(plan(runs, { history: { maxAgeDays: 30 } }).deleteRuns)).toEqual(["d"]);
  });

  it("removes artifacts of older runs but keeps their history", () => {
    const result = plan(runs, { artifacts: { maxRuns: 2 }, history: { maxRuns: 4 } });
    expect(ids(result.deleteRuns)).toEqual(["d"]);
    expect(ids(result.deleteArtifacts)).toEqual(["b", "c"]);
  });

  it("does not list artifacts again once they are gone", () => {
    const stripped = [...runs.slice(0, 2), run("b", 2, { artifacts: [] }), ...runs.slice(3)];
    expect(ids(plan(stripped, { artifacts: { maxRuns: 2 } }).deleteArtifacts)).toEqual(["c", "d"]);
  });

  it("expires failed runs sooner than good ones", () => {
    const mixed = [run("current", 0), run("ok", 10), run("bad", 10, { status: "failed" })];
    expect(ids(plan(mixed, { failedMaxAgeDays: 7 }).deleteRuns)).toEqual(["bad"]);
  });

  it("keeps the newest successful run unless told otherwise", () => {
    const failing = [run("current", 0, { status: "failed" }), run("good", 50), run("older", 60)];
    const policy = { history: { maxAgeDays: 30 } };
    expect(ids(plan(failing, policy).deleteRuns)).toEqual(["older"]);
    expect(ids(plan(failing, { ...policy, keepLatestSuccessful: false }).deleteRuns)).toEqual([
      "good",
      "older",
    ]);
  });

  it("never touches other workflows or running runs", () => {
    const mixed = [
      ...runs,
      run("other", 50, { workflowId: "other" }),
      run("live", 60, { status: "running" }),
    ];
    expect(ids(plan(mixed, { history: { maxRuns: 1 } }).deleteRuns)).toEqual(["a", "b", "c", "d"]);
  });
});
