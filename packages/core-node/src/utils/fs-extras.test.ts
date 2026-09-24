import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import yauzl from "yauzl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractZip, zipFolder } from "./fs-extras";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "pipelab-zip-cancel-"));
  tempDirs.push(dir);
  return dir;
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
    const entry = Object.assign(new yauzl.Entry(), { fileName: "large.bin" });
    let emittedChunk = false;
    const readStream = new Readable({
      read() {
        if (emittedChunk) return;
        emittedChunk = true;
        this.push(Buffer.alloc(64 * 1024, 0x5a));
      },
    });
    let sourceStopped = false;
    readStream.destroy = () => {
      // yauzl's deflated stream destroys its underlying file reader without
      // closing the exposed inflate stream.
      sourceStopped = true;
      return readStream;
    };
    const zipfile = new EventEmitter() as unknown as yauzl.ZipFile;
    zipfile.close = vi.fn();
    zipfile.readEntry = vi.fn(() => zipfile.emit("entry", entry));
    zipfile.openReadStream = vi.fn((_entry, callback) => callback(null, readStream));
    type OpenCallback = (error: Error | null, openedZipfile: yauzl.ZipFile) => void;
    vi.spyOn(yauzl, "open").mockImplementation(
      (
        _path: string,
        optionsOrCallback?: yauzl.Options | OpenCallback,
        callback?: OpenCallback,
      ) => {
        const done = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
        done?.(null, zipfile);
      },
    );

    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const extraction = extractZip(archivePath, destination, controller.signal);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const outputStat = await stat(entryPath);
        if (outputStat.size > 0) {
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
    expect(sourceStopped).toBe(true);
    expect(readStream.closed).toBe(false);
    expect((await readFile(entryPath)).byteLength).toBe(64 * 1024);
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
