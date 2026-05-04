import { mkdir, createWriteStream, createReadStream } from "node:fs";
import { execa, Options, Subprocess } from "execa";
import { mkdir as mkdirP, access, writeFile, realpath, mkdtemp, chmod, stat, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import tar from "tar";
import yauzl from "yauzl";
import archiver from "archiver";
import { pipeline } from "node:stream/promises";

/**
 * Ensures a directory exists and a file is created with default content if missing.
 */
export const ensure = async (filesPath: string, defaultContent = "{}") => {
  await mkdirP(dirname(filesPath), { recursive: true });
  try {
    await access(filesPath);
  } catch {
    await writeFile(filesPath, defaultContent);
  }
};

/**
 * Generates a unique temporary folder.
 */
export const generateTempFolder = async (base?: string) => {
  const targetBase = base || tmpdir();
  await mkdirP(targetBase, { recursive: true });
  const realPath = await realpath(targetBase);
  const tempFolder = await mkdtemp(join(realPath, "pipelab-"));
  return tempFolder;
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
export async function extractZip(archivePath: string, destinationDir: string): Promise<void> {
  await mkdirP(destinationDir, { recursive: true });
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error("Could not open zip file"));
      zipfile.on("error", reject);
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const entryPath = join(destinationDir, entry.fileName);
        if (/\/$/.test(entry.fileName)) {
          mkdirP(entryPath, { recursive: true })
            .then(() => zipfile.readEntry())
            .catch(reject);
        } else {
          mkdirP(dirname(entryPath), { recursive: true })
            .then(() => {
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err || !readStream)
                  return reject(err || new Error("Could not open read stream"));
                readStream.on("error", reject);
                const writeStream = createWriteStream(entryPath);
                writeStream.on("error", reject);
                writeStream.on("close", () => zipfile.readEntry());
                readStream.pipe(writeStream);
              });
            })
            .catch(reject);
        }
      });
      zipfile.on("end", () => resolve());
    });
  });
}

/**
 * Zips a folder.
 */
export const zipFolder = async (
  from: string,
  to: string,
  log: typeof console.log = console.log,
) => {
  const output = createWriteStream(to);
  const archive = archiver("zip", { zlib: { level: 9 } });
  return new Promise<string>((resolve, reject) => {
    output.on("close", () => {
      log(archive.pointer() + " total bytes");
      resolve(to);
    });
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(from, false);
    archive.finalize();
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
    cancelSignal: abortSignal,
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
