import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyPath, removePath } from "./filesystem";

describe("workflow filesystem primitives", () => {
  let workspace: string | undefined;

  afterEach(async () => {
    if (workspace) await rm(workspace, { recursive: true, force: true });
    workspace = undefined;
  });

  it("copies directories, records a cleanup marker, and removes them safely", async () => {
    workspace = await mkdtemp(join(tmpdir(), "pipelab-workflow-fs-"));
    const source = join(workspace, "source");
    const output = join(workspace, "output");
    await mkdir(source);
    await writeFile(join(source, "index.html"), "hello");

    const copied = await copyPath({ from: source, to: output, cleanup: true });

    expect(copied.output).toBe(output);
    expect(await readFile(join(output, "index.html"), "utf8")).toBe("hello");
    await expect(readFile(join(output, ".pipelab", "metadata.json"), "utf8")).resolves.toContain(
      '"createdBy": "fs:copy"',
    );

    await removePath(output);
    await expect(readFile(join(output, "index.html"), "utf8")).rejects.toThrow();
  });

  it("refuses to clean a non-empty directory without a Pipelab marker", async () => {
    workspace = await mkdtemp(join(tmpdir(), "pipelab-workflow-fs-"));
    const source = join(workspace, "source");
    const output = join(workspace, "output");
    await mkdir(source);
    await writeFile(join(source, "new.txt"), "new");
    await mkdir(output);
    await writeFile(join(output, "keep.txt"), "keep");

    await expect(copyPath({ from: source, to: output, cleanup: true })).rejects.toThrow(
      /not created by Pipelab/,
    );
    await expect(readFile(join(output, "keep.txt"), "utf8")).resolves.toBe("keep");
  });
});
