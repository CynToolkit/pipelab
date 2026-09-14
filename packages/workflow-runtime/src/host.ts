import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type {
  FileSystem,
  Logger,
  ProcessExecutionOptions,
  ProcessExecutor,
  ProcessResult,
  WorkflowHost,
} from "./types";

const defaultLogger: Logger = {
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

const createAbortError = (reason: unknown): Error => {
  const error = new Error(
    reason instanceof Error ? reason.message : String(reason || "Workflow cancelled"),
  );
  error.name = "AbortError";
  return error;
};

class LocalFileSystem implements FileSystem {
  async ensureDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }
}

class LocalProcessExecutor implements ProcessExecutor {
  execute(
    command: string,
    args: string[],
    options: ProcessExecutionOptions,
  ): Promise<ProcessResult> {
    const startedAt = Date.now();

    return new Promise((resolvePromise, reject) => {
      if (options.signal.aborted) {
        reject(createAbortError(options.signal.reason));
        return;
      }

      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const cleanup = () => {
        options.signal.removeEventListener("abort", onAbort);
      };

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const onAbort = () => {
        child.kill();
      };

      options.signal.addEventListener("abort", onAbort, { once: true });
      child.stdout?.on("data", (chunk: Buffer) => {
        const value = chunk.toString();
        stdout += value;
        options.onStdout?.(value);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        const value = chunk.toString();
        stderr += value;
        options.onStderr?.(value);
      });
      child.once("error", (error) => {
        finish(() =>
          reject(options.signal.aborted ? createAbortError(options.signal.reason) : error),
        );
      });
      child.once("close", (exitCode) => {
        finish(() => {
          if (options.signal.aborted) {
            reject(createAbortError(options.signal.reason));
            return;
          }
          resolvePromise({
            exitCode,
            stdout,
            stderr,
            duration: Date.now() - startedAt,
          });
        });
      });
    });
  }
}

export interface LocalHostOptions {
  logger?: Logger;
}

export const createLocalHost = (
  workspaceRoot: string,
  options: LocalHostOptions = {},
): WorkflowHost => ({
  workspace: { root: isAbsolute(workspaceRoot) ? workspaceRoot : resolve(workspaceRoot) },
  filesystem: new LocalFileSystem(),
  processes: new LocalProcessExecutor(),
  logger: options.logger ?? defaultLogger,
});
