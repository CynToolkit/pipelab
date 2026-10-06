import { createWriteStream } from "node:fs";
import { mkdir as mkdirP, writeFile, stat, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Readable } from "node:stream";
import * as tar from "tar";
import yauzl from "yauzl";
import archiver from "archiver";
import { pipeline } from "node:stream/promises";

/**
 * Ensures a directory exists and a file is created with default content if missing.
 */
export const ensure = async (filesPath: string, defaultContent = "{}") => {
  await mkdirP(dirname(filesPath), { recursive: true });
  try {
    const s = await stat(filesPath);
    if (s.size === 0) {
      await writeFile(filesPath, defaultContent);
    }
  } catch {
    await writeFile(filesPath, defaultContent);
  }
};

/**
 * Extracts a .tar.gz archive.
 */
export async function extractTarGz(archivePath: string, destinationDir: string): Promise<void> {
  await mkdirP(destinationDir, { recursive: true });
  await tar.x({
    file: archivePath,
    cwd: destinationDir,
  });
}

/**
 * Extracts a .zip archive.
 */
export async function extractZip(
  archivePath: string,
  destinationDir: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  const throwIfAborted = () => {
    if (abortSignal?.aborted) throw abortError();
  };
  throwIfAborted();
  await mkdirP(destinationDir, { recursive: true });
  throwIfAborted();

  return new Promise((resolve, reject) => {
    let zipfile: yauzl.ZipFile | undefined;
    let readStream: Readable | undefined;
    let writeStream: ReturnType<typeof createWriteStream> | undefined;
    let settled = false;

    const cleanup = () => {
      abortSignal?.removeEventListener("abort", onAbort);
      zipfile?.removeListener("error", fail);
      zipfile?.removeListener("end", onEnd);
    };
    const closeZip = () => {
      try {
        zipfile?.close();
      } catch {
        // Closing may race with yauzl reaching its end naturally.
      }
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        closeZip();
        // yauzl's deflated entry stream may override destroy() without closing
        // the exposed stream. Stop it, then settle once the destination is closed.
        readStream?.destroy();
        if (writeStream) {
          const outputClosed = waitForClose(writeStream);
          writeStream.destroy(error);
          void outputClosed.then(() => reject(error));
        } else {
          reject(error);
        }
      } else {
        closeZip();
        resolve();
      }
    };
    const fail = (error: Error) => finish(error);
    const onEnd = () => finish();
    const onAbort = () => finish(abortError());
    const readNextEntry = () => {
      if (!settled && !abortSignal?.aborted) zipfile?.readEntry();
      else if (!settled) onAbort();
    };

    abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (abortSignal?.aborted) {
      onAbort();
      return;
    }

    yauzl.open(archivePath, { lazyEntries: true }, (err, openedZipfile) => {
      if (err || !openedZipfile) {
        if (!settled) fail(err || new Error("Could not open zip file"));
        return;
      }
      zipfile = openedZipfile;
      if (settled || abortSignal?.aborted) {
        closeZip();
        if (!settled) onAbort();
        return;
      }
      zipfile.on("error", fail);
      zipfile.on("end", onEnd);
      zipfile.on("entry", (entry) => {
        if (settled || abortSignal?.aborted) {
          if (!settled) onAbort();
          return;
        }
        const entryPath = join(destinationDir, entry.fileName);
        const prepareEntry = entry.fileName.endsWith("/")
          ? mkdirP(entryPath, { recursive: true })
          : mkdirP(dirname(entryPath), { recursive: true });

        prepareEntry
          .then(() => {
            if (settled || abortSignal?.aborted) {
              if (!settled) onAbort();
              return;
            }
            if (entry.fileName.endsWith("/")) {
              readNextEntry();
              return;
            }
            zipfile?.openReadStream(entry, (streamError, openedReadStream) => {
              if (streamError || !openedReadStream) {
                fail(streamError || new Error("Could not open read stream"));
                return;
              }
              if (settled || abortSignal?.aborted) {
                openedReadStream.destroy();
                if (!settled) onAbort();
                return;
              }
              readStream = openedReadStream;
              writeStream = createWriteStream(entryPath);
              pipeline(readStream, writeStream)
                .then(() => {
                  readStream = undefined;
                  writeStream = undefined;
                  readNextEntry();
                })
                .catch(fail);
            });
          })
          .catch(fail);
      });
      zipfile.readEntry();
    });
  });
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function waitForClose(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  if (stream.closed) return Promise.resolve();
  return new Promise((resolve) => stream.once("close", resolve));
}

/**
 * Zips a folder.
 */
export const zipFolder = async (
  from: string,
  to: string,
  log: typeof console.log = console.log,
  abortSignal?: AbortSignal,
) => {
  if (abortSignal?.aborted) throw abortError();

  const output = createWriteStream(to);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const cleanup = () => abortSignal?.removeEventListener("abort", onAbort);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!error) {
        resolve(to);
        return;
      }

      try {
        archive.abort();
      } catch {}
      const closed = waitForClose(output);
      output.destroy(error);
      void closed.then(
        () => reject(error),
        () => reject(error),
      );
    };
    const onAbort = () => finish(abortError());

    output.on("close", () => {
      if (settled) return;
      log(archive.pointer() + " total bytes");
      finish();
    });

    output.on("error", finish);
    archive.on("error", finish);

    abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (abortSignal?.aborted) {
      onAbort();
      return;
    }

    archive.pipe(output);
    archive.directory(from, false);
    archive.finalize().catch(finish);
  });
};

export { downloadFile, runWithLiveLogs, type DownloadHooks } from "@pipelab/plugin-core";

/**
 * Calculates the total size of a directory recursively.
 */
export async function getFolderSize(dirPath: string): Promise<number> {
  try {
    const files = await readdir(dirPath, { withFileTypes: true });
    const ArrayOfPromises = files.map(async (file) => {
      const path = join(dirPath, file.name);
      if (file.isDirectory()) {
        try {
          return await getFolderSize(path);
        } catch {
          return 0;
        }
      }
      try {
        const { size } = await stat(path);
        return size;
      } catch {
        return 0;
      }
    });
    const results = await Promise.all(ArrayOfPromises);
    return results.reduce((acc, size) => acc + size, 0);
  } catch {
    return 0;
  }
}
