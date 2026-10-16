import { chmod, mkdtemp, readlink, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative, sep } from "node:path";
import { RELEASE_BEFORE_BUILD_TASK_ID } from "@pipelab/shared";
import type { WorkflowTask } from "@pipelab/workflow-runtime";
import type { ProviderServices } from "../workflow-tasks";

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The beforeBuild hook ${field} must be a non-empty string.`);
  }
  return value;
};

const isInside = (root: string, target: string): boolean => {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
};

const assertNoExternalSymlinks = async (root: string): Promise<void> => {
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    if (!directory) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const linkTarget = await readlink(entryPath);
        const resolvedTarget = await realpath(entryPath).catch(() => {
          throw new Error(`The beforeBuild hook input contains a broken symlink: ${entryPath}`);
        });
        if (!isInside(root, resolvedTarget)) {
          throw new Error(
            `The beforeBuild hook input contains a symlink outside its staged copy: ${entryPath}`,
          );
        }
        if (isAbsolute(linkTarget)) {
          throw new Error(`The beforeBuild hook input contains an absolute symlink: ${entryPath}`);
        }
      } else if (entry.isDirectory()) pending.push(entryPath);
    }
  }
};

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

const createPnpmShim = async (
  workspaceRoot: string,
  nodeExecutable: string,
  pnpmExecutable: string,
): Promise<string> => {
  const shimDirectory = await mkdtemp(join(workspaceRoot, "pipelab-before-build-bin-"));
  if (process.platform === "win32") {
    const batchEscape = (value: string) => value.replaceAll("%", "%%");
    await writeFile(
      join(shimDirectory, "pnpm.cmd"),
      `@echo off\r\n"${batchEscape(nodeExecutable)}" "${batchEscape(pnpmExecutable)}" %*\r\nexit /b %errorlevel%\r\n`,
    );
  } else {
    const shim = join(shimDirectory, "pnpm");
    await writeFile(
      shim,
      `#!/bin/sh\nexec ${shellQuote(nodeExecutable)} ${shellQuote(pnpmExecutable)} "$@"\n`,
    );
    await chmod(shim, 0o755);
  }
  return shimDirectory;
};

const environmentVariableName = (name: string): string =>
  Object.keys(process.env).find((key) => key.toUpperCase() === name) || name;

const ensureNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    const error = new Error(String(signal.reason || "Workflow cancelled"));
    error.name = "AbortError";
    throw error;
  }
};

export const releaseBeforeBuildWorkflowTask: WorkflowTask<ProviderServices> = async (context) => {
  const inputArtifact = requiredString(context.inputs.input, "input artifact");
  const command = requiredString(context.inputs.command, "command");
  const profileId = requiredString(context.inputs.profileId, "build profile ID");
  const artifactRoot = await realpath(inputArtifact).catch(() => {
    throw new Error(`The beforeBuild hook input artifact does not exist: ${inputArtifact}`);
  });
  const artifactStats = await stat(artifactRoot);
  if (!artifactStats.isDirectory()) {
    throw new Error(
      `The beforeBuild hook input is not a directory and cannot be staged safely: ${artifactRoot}`,
    );
  }
  await assertNoExternalSymlinks(artifactRoot);
  ensureNotAborted(context.signal);

  const { run, executables } = context.services;
  const runtime = {
    PIPELAB_RUN_ID: requiredString(run.id, "run ID"),
    PIPELAB_WORKFLOW_ID: requiredString(run.workflowId, "workflow ID"),
    PIPELAB_PROJECT_ID: requiredString(run.projectId, "project ID"),
    PIPELAB_BUILD_PROFILE_ID: profileId,
    PIPELAB_ARTIFACT_DIR: artifactRoot,
    PIPELAB_RELEASE_VERSION: requiredString(run.releaseVersion, "release version"),
  };
  const shimDirectory = await createPnpmShim(
    context.workspace.root,
    requiredString(executables.node, "managed Node executable"),
    requiredString(executables.pnpm, "managed pnpm executable"),
  );
  const pathName = environmentVariableName("PATH");
  const inheritedPath = process.env[pathName] || "";
  const env: Record<string, string | undefined> = {};

  for (const key of Object.keys(process.env)) {
    if (key.toUpperCase().startsWith("PIPELAB_")) {
      env[key] = undefined;
    }
  }
  Object.assign(env, runtime, {
    [pathName]: [shimDirectory, dirname(executables.node), inheritedPath]
      .filter(Boolean)
      .join(delimiter),
  });
  if (process.platform === "win32") {
    const pathextName = environmentVariableName("PATHEXT");
    const extensions = (process.env[pathextName] || ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .filter(Boolean);
    if (!extensions.some((extension) => extension.toUpperCase() === ".CMD"))
      extensions.push(".CMD");
    env[pathextName] = extensions.join(";");
  }

  context.log(`Input artifact: ${artifactRoot}`);
  context.log("Running beforeBuild command in staged input.");
  try {
    const result = await context.processes.execute(command, [], {
      cwd: artifactRoot,
      env,
      shell: true,
      signal: context.signal,
      onStdout: (chunk) => context.logStream("stdout", chunk),
      onStderr: (chunk) => context.logStream("stderr", chunk),
    });
    ensureNotAborted(context.signal);
    if (result.exitCode !== 0) {
      throw new Error(`beforeBuild command exited with code ${result.exitCode ?? -1}.`);
    }
    if (context.step.artifacts?.output) context.setArtifact("output", artifactRoot);
    return { output: artifactRoot, exitCode: result.exitCode, duration: result.duration };
  } finally {
    await rm(shimDirectory, { recursive: true, force: true });
  }
};

export { RELEASE_BEFORE_BUILD_TASK_ID };
