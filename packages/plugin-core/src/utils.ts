import { Options, Subprocess } from "execa";
import { IPty, type IPtyForkOptions, type IWindowsPtyForkOptions } from "@lydell/node-pty";
import { ExternalCommandError } from "./custom-errors";

export const fileExists = async (path: string): Promise<boolean> => {
  try {
    await import("fs/promises").then(({ access }) => access(path));
    return true;
  } catch {
    return false;
  }
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
  },
): Promise<void> => {
  const { execa } = await import("execa");
  return new Promise((resolve, reject) => {
    console.log("command: ", command, args.join(" "));

    const subprocess = execa(command, args, {
      ...execaOptions,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });

    subprocess.stdout.on("data", (data: Buffer) => {
      hooks?.onStdout?.(data.toString(), subprocess);
    });

    subprocess.stderr?.on("data", (data: Buffer) => {
      hooks?.onStderr?.(data.toString(), subprocess);
    });

    subprocess.on("error", (error: Error) => {
      console.log("error", error);
      return reject(error);
    });

    subprocess.on("close", (code: number) => {
      console.log("close", code);
      hooks?.onExit?.(code);

      if (code === 0) {
        return resolve();
      } else {
        return reject(new Error(`Command exited with non-zero code: ${code}`));
      }
    });

    subprocess.on("disconnect", () => {
      console.log("disconnect");
      hooks?.onExit?.(0);
      return resolve();
    });

    subprocess.on("exit", (code: number) => {
      console.log("exit", code);
      hooks?.onExit?.(code);

      if (code === 0) {
        return resolve();
      } else {
        return reject(new Error(`Command exited with non-zero code: ${code}`));
      }
    });
  });
};

export const runWithLiveLogsPTY = async (
  command: string,
  args: string[],
  ptyOptions: IPtyForkOptions | IWindowsPtyForkOptions,
  log: typeof console.log,
  hooks?: {
    onStdout?: (data: string, subprocess: IPty) => void;
    onStderr?: (data: string, subprocess: IPty) => void;
    onExit?: (code: number) => void;
    onCreated?: (subprocess: IPty) => void;
  },
  abortSignal?: AbortSignal,
): Promise<void> => {
  const { spawn } = await import("@lydell/node-pty");
  return new Promise((resolve, reject) => {
    console.log("command: ", command, args.join(" "));

    const subprocess = spawn(command, args, ptyOptions);

    hooks?.onCreated?.(subprocess);

    subprocess.onData((data) => {
      hooks?.onStdout?.(data.toString(), subprocess);
    });

    subprocess.onExit(({ exitCode, signal }) => {
      console.log("exit", exitCode);
      hooks?.onExit?.(exitCode);

      if (exitCode === 0) {
        return resolve();
      } else {
        return reject(
          new ExternalCommandError(`Command exited with non-zero exitCode: ${exitCode}`, exitCode),
        );
      }
    });
  });
};

export interface Hooks {
  onProgress?: (data: { progress: number; downloadedSize: number }) => void;
}

/**
 * Downloads a file from a given URL to a specified local path with progress tracking.
 *
 * @param url - The URL of the file to download.
 * @param localPath - The local file path to save the downloaded file.
 * @returns A promise that resolves when the file is downloaded.
 */
export const downloadFile = async (
  url: string,
  localPath: string,
  hooks?: Hooks,
  abortSignal?: AbortSignal,
): Promise<void> => {
  // Fetch the resource
  const response = await fetch(url, {
    signal: abortSignal,
  });

  // Check if the fetch was successful
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  // Get the total size of the file
  const contentLength = response.headers.get("content-length");
  if (!contentLength) {
    throw new Error("Content-Length header is missing");
  }
  const totalSize = parseInt(contentLength, 10);

  // Track progress
  let downloadedSize = 0;

  // Create a write stream for the file
  const { createWriteStream } = await import("fs");
  const fileStream = createWriteStream(localPath);

  // Create a readable stream to monitor progress
  const progressStream = new TransformStream({
    transform(chunk, controller) {
      downloadedSize += chunk.length;
      const progress = (downloadedSize / totalSize) * 100;
      if (hooks?.onProgress) {
        hooks.onProgress({
          progress,
          downloadedSize,
        });
      }
      controller.enqueue(chunk);
    },
  });

  // Pipe the response through the progress tracker and into the file
  const readable = response.body?.pipeThrough(progressStream);
  if (!readable) {
    throw new Error("Failed to create a readable stream");
  }

  const { pipeline } = await import("stream/promises");
  await pipeline(readable, fileStream);
};

/**
 * Installs an NPM package from the npm registry as a tarball if not already present.
 * @param thirdpartyDir The directory where third-party tools are stored.
 * @param name The name of the package (e.g., 'pnpm' or '@poki/cli').
 * @param version The version of the package.
 * @returns A Promise that resolves to the path of the extracted package (the 'package' subfolder).
 */
export const ensureNPMPackage = async (thirdpartyDir: string, name: string, version: string) => {
  const { join } = await import("node:path");
  const { access, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { extractTarGz } = await import("./archive-utils.js");
  const { generateTempFolder } = await import("./fs-utils.js");

  const packageDir = join(thirdpartyDir, name, version);
  const finalPath = join(packageDir, "package");
  const markerFile = join(packageDir, ".installed");

  // 1. Check if already installed
  try {
    await access(markerFile);
    return finalPath;
  } catch (e) {
    console.log(`NPM package ${name}@${version} not found at ${finalPath}, installing...`);
  }

  // 2. Determine download URL
  let tarballName = name;
  if (name.startsWith("@")) {
    const [, pkgName] = name.split("/");
    tarballName = pkgName;
  }
  const downloadUrl = `https://registry.npmjs.org/${name}/-/${tarballName}-${version}.tgz`;

  const tempDir = await generateTempFolder(join(thirdpartyDir, ".tmp"));
  const tarballPath = join(tempDir, `${tarballName}-${version}.tgz`);

  // 3. Download the tarball
  console.log(`Downloading ${name}@${version} from ${downloadUrl}...`);
  await downloadFile(downloadUrl, tarballPath);

  // 4. Extract
  console.log(`Extracting ${name}@${version} to ${packageDir}...`);
  await mkdir(packageDir, { recursive: true });
  await extractTarGz(tarballPath, packageDir);

  // 5. Cleanup & Marker
  await writeFile(markerFile, new Date().toISOString());
  await rm(tempDir, { recursive: true, force: true });

  return finalPath;
};
