import { execa, Options, Subprocess } from "execa";
import { ExternalCommandError } from "./custom-errors.js";
import { join } from "node:path";
import { access, mkdir, writeFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import pacote from "pacote";

export const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
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
    onCreated?: (subprocess: Subprocess) => void;
  },
  abortSignal?: AbortSignal,
): Promise<void> => {
  console.log("command: ", command, args.join(" "));

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
    throw new ExternalCommandError(error.message, code);
  }
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

  await pipeline(readable, fileStream);
};

/**
 * Installs an NPM package from the npm registry as a tarball if not already present.
 * @param thirdpartyDir The directory where third-party tools are stored.
 * @param name The name of the package (e.g., 'pnpm' or '@poki/cli').
 * @param version The version of the package.
 * @param options (Optional) configuration for dependency installation.
 * @returns A Promise that resolves to the path of the extracted package (the 'package' subfolder).
 */
export const ensureNPMPackage = async (
  thirdpartyDir: string,
  name: string,
  version: string,
  options?: {
    nodePath?: string;
    pnpmPath?: string;
    installDeps?: boolean;
  },
) => {
  const packageDir = join(thirdpartyDir, name, version);
  const finalPath = join(packageDir, "package");

  // 1. Check if already installed
  if (await fileExists(finalPath)) {
    return finalPath;
  }
  console.log(`NPM package ${name}@${version} not found at ${finalPath}, installing...`);

  // 2. Extract using pacote
  console.log(`Extracting ${name}@${version} to ${finalPath}...`);
  await mkdir(packageDir, { recursive: true });
  await pacote.extract(`${name}@${version}`, finalPath);

  // 3. Install dependencies if requested
  if (options?.installDeps && options.pnpmPath) {
    console.log(
      `Installing dependencies for ${name}@${version} using pnpm at ${options.pnpmPath}...`,
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // We use the pnpm .cjs bundle directly with node
    const node = options.nodePath || process.execPath;
    await execa(node, [options.pnpmPath, "install", "--prod"], {
      cwd: finalPath,
      stdio: "inherit",
    });
  }

  return finalPath;
};
