import { createWriteStream } from "node:fs";
import { execa, Options, Subprocess } from "execa";
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
        readStream?.destroy(error);
        writeStream?.destroy(error);
        closeZip();
        reject(error);
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
      if (error) reject(error);
      else resolve(to);
    };
    const onAbort = () => {
      const error = abortError();
      try {
        archive.abort();
      } catch {}
      try {
        output.destroy(error);
      } catch {}
      finish(error);
    };

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

/**
 * Downloads a file with progress tracking.
 */
export interface DownloadHooks {
  onProgress?: (data: { progress: number; downloadedSize: number }) => void;
}

export const downloadFile = async (
  url: string,
  localPath: string,
  hooks?: DownloadHooks,
  abortSignal?: AbortSignal,
): Promise<void> => {
  const response = await fetch(url, { signal: abortSignal });
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
  const contentLength = response.headers.get("content-length");
  if (!contentLength) throw new Error("Content-Length header is missing");
  const totalSize = parseInt(contentLength, 10);
  let downloadedSize = 0;
  const fileStream = createWriteStream(localPath);
  const progressStream = new TransformStream({
    transform(chunk, controller) {
      downloadedSize += chunk.length;
      const progress = (downloadedSize / totalSize) * 100;
      hooks?.onProgress?.({ progress, downloadedSize });
      controller.enqueue(chunk);
    },
  });
  const readable = response.body?.pipeThrough(progressStream);
  if (!readable) throw new Error("Failed to create a readable stream");
  await pipeline(readable, fileStream);
};

export const runWithLiveLogs = async (
  command: string,
  args: string[],
  execaOptions: Options,
  log: typeof console.log,
  hooks?: {
    onStdout?: (data: string, subprocess: Subprocess) => void;
    onStderr?: (data: string, subprocess: Subprocess) => void;
    onExit?: (code: number) => void;
    onCreated?: (subprocess: Subprocess) => void;
  },
  abortSignal?: AbortSignal,
): Promise<void> => {
  const subprocess = execa(command, args, {
    ...execaOptions,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
    env: {
      ...process.env,
      ...execaOptions.env,
      TERM: "xterm-256color",
      FORCE_STDERR_LOGGING: "1",
    },
    cancelSignal: abortSignal ?? execaOptions.cancelSignal,
  });

  hooks?.onCreated?.(subprocess);

  subprocess.stdout?.on("data", (data: Buffer) => {
    hooks?.onStdout?.(data.toString(), subprocess);
  });

  subprocess.stderr?.on("data", (data: Buffer) => {
    hooks?.onStderr?.(data.toString(), subprocess);
  });

  try {
    const { exitCode } = await subprocess;
    hooks?.onExit?.(exitCode ?? 0);
  } catch (error: any) {
    const code = error.exitCode ?? 1;
    hooks?.onExit?.(code);
    throw new Error(`Command failed with exit code ${code}: ${error.message}`);
  }
};

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
