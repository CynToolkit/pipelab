import { mkdir } from "node:fs/promises";

/**
 * Extracts a .zip archive.
 * @param archivePath The full path to the .zip file.
 * @param destinationDir The directory to extract contents into.
 * @returns A Promise that resolves when extraction is complete.
 */
export async function extractZip(archivePath: string, destinationDir: string): Promise<void> {
  const yauzl = await import("yauzl");
  const { createWriteStream } = await import("node:fs");
  const { join, dirname } = await import("node:path");

  console.log(`Extracting ${archivePath} to ${destinationDir}...`);

  // Ensure the destination directory exists
  await mkdir(destinationDir, { recursive: true });

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
          mkdir(entryPath, { recursive: true })
            .then(() => zipfile.readEntry())
            .catch(reject);
        } else {
          // It's a file
          // Ensure parent directory exists (just in case)
          mkdir(dirname(entryPath), { recursive: true })
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

export const zipFolder = async (from: string, to: string, log: typeof console.log) => {
  const archiver = (await import("archiver")).default;
  const { createWriteStream } = await import("node:fs");

  const output = createWriteStream(to);

  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level.
  });

  // eslint-disable-next-line no-async-promise-executor
  return new Promise<string>(async (resolve, reject) => {
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on("close", function () {
      log(archive.pointer() + " total bytes");
      log("archiver has been finalized and the output file descriptor has closed.");
      resolve(to);
    });

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but part of NodeJS.
    output.on("end", function () {
      log("Data has been drained");
    });

    // good practice to catch this error and expose it to the user
    archive.on("error", function (err) {
      reject(err);
    });

    // pipe archive data to the file
    archive.pipe(output);

    archive.directory(from, false);

    // finalize the archive (ie we are done appending files but streams have to finish yet)
    // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
    await archive.finalize();
  });
};
