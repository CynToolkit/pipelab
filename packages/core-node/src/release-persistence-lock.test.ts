import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serializeFileMutation } from "./release-persistence-lock";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("cross-process persistence lock", () => {
  it("serializes mutations and releases the lock after completion", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-lock-"));
    temporaryPaths.push(root);
    const filePath = join(root, "projects.json");
    let active = 0;
    let maximumActive = 0;
    const mutate = () =>
      serializeFileMutation(filePath, async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
      });

    await Promise.all([mutate(), mutate()]);

    expect(maximumActive).toBe(1);
    await expect(stat(`${filePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("releases its lock when a mutation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-lock-"));
    temporaryPaths.push(root);
    const filePath = join(root, "projects.json");

    await expect(
      serializeFileMutation(filePath, async () => {
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");
    await expect(stat(`${filePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
