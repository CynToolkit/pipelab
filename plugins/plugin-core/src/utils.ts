import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { execa, type Options, type Subprocess } from "execa";
import type { ProviderHostContext } from "./pipelab";

export { fetchPackage, runPnpm, isOnline, type FetchOptions } from "./package-utils";
export type Hooks = DownloadHooks;

export const resolveBundledAsset = (
  name: string,
  context: Pick<ProviderHostContext, "resolveBundledAsset">,
) => context.resolveBundledAsset(name);

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
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "exitCode" in error &&
      typeof error.exitCode === "number"
        ? error.exitCode
        : 1;
    hooks?.onExit?.(code);
    throw new Error(
      `Command failed with exit code ${code}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const fileExists = async (path: string): Promise<boolean> => {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
};
