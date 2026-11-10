import { describe, expect, it } from "vitest";
import type { BuildHistoryEntry } from "@pipelab/shared";
import { retentionPreview } from "./workflow-retention-preview";

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const run = (id: string, ageDays: number, size = 100, status = "completed") =>
  ({
    id,
    workflowId: "wf",
    status,
    createdAt: now - ageDays * DAY,
    artifacts: [{ id: `${id}-a`, size }],
  }) as unknown as BuildHistoryEntry;

describe("retentionPreview", () => {
  const entries = [run("new", 1), run("mid", 2), run("old", 3), run("older", 4)];

  it("shows nothing for an empty policy", () => {
    expect(retentionPreview(entries, "wf", {}, now)).toMatchObject({
      rows: [],
      runCount: 0,
      fileCount: 0,
      bytes: 0,
      total: 4,
    });
  });

  it("separates deleted runs from runs that only lose their files and sums what is freed", () => {
    const preview = retentionPreview(
      entries,
      "wf",
      { history: { maxRuns: 3 }, artifacts: { maxRuns: 2 } },
      now,
    );
    expect(preview.rows.map((row) => [row.entry.id, row.action])).toEqual([
      ["old", "delete-files"],
      ["older", "delete-run"],
    ]);
    expect(preview).toMatchObject({ runCount: 1, fileCount: 1, bytes: 200 });
  });

  it("marks the latest successful run as protected instead of removing it", () => {
    const failing = [run("bad", 1, 100, "failed"), run("good", 40), run("older", 50)];
    const preview = retentionPreview(failing, "wf", { history: { maxAgeDays: 30 } }, now);
    expect(preview.rows.map((row) => [row.entry.id, row.action])).toEqual([
      ["good", "protected"],
      ["older", "delete-run"],
    ]);
    expect(preview).toMatchObject({ runCount: 1, bytes: 100 });
  });
});
