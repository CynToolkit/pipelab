import { mkdir, readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeJsonFileAtomically } from "./atomic-json";

describe("writeJsonFileAtomically", () => {
  it("leaves the existing file untouched when the final rename fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-atomic-json-"));
    const target = join(root, "target");
    await mkdir(target);
    await expect(writeJsonFileAtomically(target, { changed: true })).rejects.toBeDefined();
    await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "EISDIR" });
  });
});
