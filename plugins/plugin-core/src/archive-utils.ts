import { mkdir, createReadStream, createWriteStream } from "node:fs";
import { mkdir as mkdirP } from "node:fs/promises";
import { join, dirname } from "node:path";
import zlib from "zlib";
import * as tar from "tar";
import yauzl from "yauzl";
import archiver from "archiver";

/**
 * Extracts a .tar.gz archive.
 * @param archivePath The full path to the .tar.gz file.
 * @param destinationDir The directory to extract contents into.
 * @returns A Promise that resolves when extraction is complete.
 */
export async function extractTarGz(archivePath: string, destinationDir: string): Promise<void> {
  console.log(`Extracting ${archivePath} to ${destinationDir}...`);

  // Ensure the destination directory exists
  await mkdirP(destinationDir, { recursive: true });

  await tar.x({
    file: archivePath,
    cwd: destinationDir,
  });

  console.log("Extraction finished.");
}

/**
 * Extracts a .zip archive.
 * @param archivePath The full path to the .zip file.
 * @param destinationDir The directory to extract contents into.
 * @returns A Promise that resolves when extraction is complete.
 */
export async function extractZip(archivePath: string, destinationDir: string): Promise<void> {
  console.log(`Extracting ${archivePath} to ${destinationDir}...`);

  // Ensure the destination directory exists
  await mkdirP(destinationDir, { recursive: true });

  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        return reject(err || new Error("Could not open zip file"));
      }

      zipfile.on("error", reject);

      zipfile.readEntry(); // Start reading entries

      zipfile.on("entry", (entry) => {
        const entryPath = join(destinationDir, entry.fileName);

        if (/\/$/.test(entry.fileName)) {
          // It's a directory
          mkdirP(entryPath, { recursive: true })
            .then(() => zipfile.readEntry())
            .catch(reject);
        } else {
          // It's a file
          // Ensure parent directory exists (just in case)
          mkdirP(dirname(entryPath), { recursive: true })
            .then(() => {
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err || !readStream) {
                  return reject(err || new Error("Could not open read stream"));
                }

                readStream.on("error", reject);
                const writeStream = createWriteStream(entryPath);
                writeStream.on("error", reject);
                writeStream.on("close", () => {
                  zipfile.readEntry();
                });
                readStream.pipe(writeStream);
              });
            })
            .catch(reject);
        }
      });

      zipfile.on("end", () => {
        console.log("Zip extraction finished.");
        resolve();
      });
    });
  });
}

export const zipFolder = async (
  from: string,
  to: string,
  log: typeof console.log,
  abortSignal?: AbortSignal,
) => {
  if (abortSignal?.aborted) {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    throw abortError;
  }

  const output = createWriteStream(to);

  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level.
  });

  return new Promise<string>((resolve, reject) => {
    const onAbort = () => {
      try {
        archive.abort();
      } catch {}
      try {
        output.destroy();
      } catch {}
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      reject(abortError);
    };

    if (abortSignal) {
      abortSignal.addEventListener("abort", onAbort);
    }

    output.on("close", function () {
      if (abortSignal) {
        abortSignal.removeEventListener("abort", onAbort);
      }
      log(archive.pointer() + " total bytes");
      log("archiver has been finalized and the output file descriptor has closed.");
      resolve(to);
    });

    output.on("end", function () {
      log("Data has been drained");
    });

    archive.on("error", function (err) {
      if (abortSignal) {
        abortSignal.removeEventListener("abort", onAbort);
      }
      reject(err);
    });

    archive.pipe(output);

    archive.directory(from, false);

    archive.finalize().catch((err) => {
      if (abortSignal) {
        abortSignal.removeEventListener("abort", onAbort);
      }
      reject(err);
    });
  });
};
