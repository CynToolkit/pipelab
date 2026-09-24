import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractZip, zipFolder } from "./fs-extras";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "pipelab-zip-cancel-"));
  tempDirs.push(dir);
  return dir;
}

async function makeStoredZip(path: string, contents: Buffer) {
  const output = createWriteStream(path);
  const archive = archiver("zip");
  const closed = new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
  });
  archive.pipe(output);
  archive.append(Readable.from([contents]), { name: "large.bin", store: true });
  await archive.finalize();
  await closed;
}

describe("extractZip cancellation", () => {
  it("rejects with AbortError when the signal is already aborted", async () => {
    const dir = await makeTempDir();
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractZip(join(dir, "missing.zip"), join(dir, "out"), controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("stops an active extraction and rejects with AbortError", async () => {
    const dir = await makeTempDir();
    const archivePath = join(dir, "large.zip");
    const destination = join(dir, "out");
    const entryPath = join(destination, "large.bin");
    await makeStoredZip(archivePath, Buffer.alloc(64 * 1024 * 1024, 0x5a));

    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const extraction = extractZip(archivePath, destination, controller.signal);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const entry = await stat(entryPath);
        if (entry.size < 64 * 1024 * 1024) {
          controller.abort();
          break;
        }
      } catch {
        // The output file is created only after the ZIP entry begins processing.
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(controller.signal.aborted).toBe(true);
    await expect(extraction).rejects.toMatchObject({ name: "AbortError" });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect((await readFile(entryPath)).byteLength).toBeLessThan(64 * 1024 * 1024);
  });

  it("rejects with AbortError when ZIP creation is already cancelled", async () => {
    const dir = await makeTempDir();
    const source = join(dir, "source");
    await mkdir(source);
    await writeFile(join(source, "file.txt"), "contents");
    const controller = new AbortController();
    controller.abort();

    await expect(
      zipFolder(source, join(dir, "cancelled.zip"), undefined, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("stops active ZIP creation and rejects with AbortError", async () => {
    const dir = await makeTempDir();
    const source = join(dir, "source");
    await mkdir(source);
    const contents = Buffer.alloc(64 * 1024 * 1024);
    let seed = 0x12345678;
    for (let index = 0; index < contents.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      contents[index] = seed >>> 24;
    }
    await writeFile(join(source, "large.bin"), contents);

    const archivePath = join(dir, "large.zip");
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const creation = zipFolder(source, archivePath, undefined, controller.signal);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const archive = await stat(archivePath);
        if (archive.size > 0 && archive.size < contents.length) {
          controller.abort();
          break;
        }
      } catch {
        // The output archive is created when ZIP generation starts.
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(controller.signal.aborted).toBe(true);
    await expect(creation).rejects.toMatchObject({ name: "AbortError" });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect((await stat(archivePath)).size).toBeLessThan(contents.length);
  });
});
