import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("fails closed on a lock left by a process that no longer exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-lock-"));
    temporaryPaths.push(root);
    const filePath = join(root, "projects.json");
    await writeFile(`${filePath}.lock`, JSON.stringify({ pid: 2_147_483_647, token: "stale" }));
    await expect(serializeFileMutation(filePath, async () => undefined)).rejects.toThrow(
      /Stale persistence lock.*Verify no Pipelab writer is active/,
    );
    await expect(readFile(`${filePath}.lock`, "utf8")).resolves.toContain("stale");
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
    await expect(readFile(`${filePath}.lock`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
