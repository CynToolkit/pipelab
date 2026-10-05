import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { existsSync as existsSyncSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createLocalHost,
  runWorkflow,
  type WorkflowArtifactDefinition,
  type WorkflowEvent,
  type WorkflowTask,
  type WorkflowTaskRegistry,
  type WorkflowHost,
} from "@pipelab/workflow-runtime";
import { execa } from "execa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Finds the monorepo root by looking for pnpm-workspace.yaml.
 */
export function findProjectRoot(startDir: string): string {
  let curr = startDir;
  while (curr !== dirname(curr)) {
    if (existsSyncSync(join(curr, "pnpm-workspace.yaml"))) {
      return curr;
    }
    curr = dirname(curr);
  }
  throw new Error("Could not find project root (pnpm-workspace.yaml)");
}

export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

/**
 * Creates a unique sandbox directory and returns a bundle containing its path
 * and a pre-filled remove utility.
 */
export const createSandbox = async (prefix: string) => {
  const sandboxPath = join(tmpdir(), `${prefix}-${Math.random().toString(36).substring(7)}`);

  const paths = {
    input: join(sandboxPath, "input"),
    output: join(sandboxPath, "output"),
    userData: join(sandboxPath, "user-data"),
    project: join(sandboxPath, "project"),
    thirdparty: join(sandboxPath, "thirdparty"),
  };

  await mkdir(sandboxPath, { recursive: true });
  await Promise.all([
    mkdir(paths.input, { recursive: true }),
    mkdir(paths.output, { recursive: true }),
    mkdir(paths.userData, { recursive: true }),
  ]);

  return {
    path: sandboxPath,
    paths,
    /**
     * Creates a mock binary/script in the sandbox.
     */
    mockBinary: async (
      relativePath: string,
      content?: string,
      options: { extension?: string | false } = {},
    ) => {
      const fullPath = join(sandboxPath, relativePath);
      let platformPath = fullPath;

      if (options.extension === false) {
        // Use exactly the path provided
      } else if (options.extension) {
        platformPath = `${fullPath}.${options.extension}`;
      } else {
        const hasExtension = /\.[a-z0-9]+$/i.test(relativePath);
        platformPath = hasExtension ? fullPath : isWindows ? `${fullPath}.cmd` : `${fullPath}.sh`;
      }

      const defaultContent = isWindows
        ? `@echo off\necho Mock Binary Execution: %*\nexit /b 0`
        : `#!/bin/bash\necho "Mock Binary Execution: $@"\nexit 0`;

      await mkdir(dirname(platformPath), { recursive: true });
      await writeFile(platformPath, content || defaultContent);

      if (!isWindows) {
        await chmod(platformPath, 0o755);
      }

      return platformPath;
    },
    remove: async () => {
      await rm(sandboxPath, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 500,
      });
    },
  };
};

/**
 * Runs the Pipelab CLI out-of-process.
 */
export const runCLI = async (
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
  } = {},
) => {
  const projectRoot = findProjectRoot(__dirname);
  const cliPath = resolve(projectRoot, "apps/cli/src/index.ts");

  return execa("tsx", [cliPath, ...args], {
    cwd: options.cwd || projectRoot,
    env: {
      ...process.env,
      PIPELAB_DISABLE_HISTORY: "true",
      ...options.env,
    },
  });
};

/** Runs a native workflow task through workflow-runtime for focused plugin tests. */
export const runWorkflowTask = async <TServices = unknown>(
  task: WorkflowTask<TServices>,
  options: {
    inputs?: Record<string, unknown>;
    workspacePath: string;
    artifacts?: Record<string, WorkflowArtifactDefinition>;
    signal?: AbortSignal;
    services?: TServices;
    host?: Partial<WorkflowHost>;
  },
) => {
  const events: WorkflowEvent[] = [];
  const logs: string[] = [];
  const host = {
    ...createLocalHost(options.workspacePath, {
      logger: {
        info: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        warn: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        error: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      },
    }),
    ...options.host,
  };
  const tasks: WorkflowTaskRegistry<TServices> = { "test:native": task };
  const result = await runWorkflow(
    {
      version: 1,
      steps: [
        {
          id: "task",
          uses: "test:native",
          with: options.inputs,
          artifacts: options.artifacts,
        },
      ],
    },
    {
      host,
      tasks,
      services: options.services,
      signal: options.signal,
      onEvent: (event) => events.push(event),
    },
  );

  return {
    outputs: result.outputs.task,
    artifacts: result.steps.task.artifacts,
    result,
    events,
    logs,
  };
};

/**
 * Runs the packaged electron app (smoke test)
 */
export const runElectronApp = async (app_path: string, options: { timeoutMs?: number } = {}) => {
  const child = execa(app_path, [], {
    cleanup: true,
    timeout: options.timeoutMs || 120000,
  });
  return child;
};
