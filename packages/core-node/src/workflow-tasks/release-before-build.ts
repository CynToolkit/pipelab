import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { RELEASE_BEFORE_BUILD_TASK_ID } from "@pipelab/shared";
import type { WorkflowTask } from "@pipelab/workflow-runtime";

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The beforeBuild hook ${field} must be a non-empty string.`);
  }
  return value;
};

const stringArguments = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("The beforeBuild hook parameters must be an array of strings.");
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

const resolveArtifactPath = async (
  root: string,
  relativePath: unknown,
  label: string,
  allowCurrentDirectory = false,
): Promise<string> => {
  const path = requiredString(relativePath, label);
  const normalized = path.replaceAll("\\", "/");
  if (
    isAbsolute(path) ||
    normalized.includes(":") ||
    normalized.includes("\0") ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`The beforeBuild hook ${label} must stay inside its staged artifact.`);
  }
  if (!allowCurrentDirectory && normalized.split("/").every((part) => part === ".")) {
    throw new Error(`The beforeBuild hook ${label} must name a file in its staged artifact.`);
  }

  const candidate = resolve(root, normalized);
  if (!isInside(root, candidate)) {
    throw new Error(`The beforeBuild hook ${label} must stay inside its staged artifact.`);
  }
  const actualPath = await realpath(candidate).catch(() => {
    throw new Error(`The beforeBuild hook ${label} was not found in its staged artifact: ${path}`);
  });
  if (!isInside(root, actualPath)) {
    throw new Error(`The beforeBuild hook ${label} resolves outside its staged artifact: ${path}`);
  }
  return actualPath;
};

const ensureNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    const error = new Error(String(signal.reason || "Workflow cancelled"));
    error.name = "AbortError";
    throw error;
  }
};

export const releaseBeforeBuildWorkflowTask: WorkflowTask = async (context) => {
  const inputArtifact = requiredString(context.inputs.input, "input artifact");
  const command = requiredString(context.inputs.command, "command");
  const scriptFile = requiredString(context.inputs.scriptFile, "script file");
  const parameters = stringArguments(context.inputs.parameters);
  const workingDirectory = context.inputs.workingDirectory ?? ".";
  const failureMode = context.inputs.failureMode === "warn" ? "warn" : "fail";

  const artifactRoot = await realpath(inputArtifact).catch(() => {
    throw new Error(`The beforeBuild hook input artifact does not exist: ${inputArtifact}`);
  });
  const artifactStats = await stat(artifactRoot);
  if (!artifactStats.isDirectory()) {
    throw new Error(
      `The beforeBuild hook input is not a directory and cannot be staged safely: ${artifactRoot}`,
    );
  }
  const effectiveScriptPath = await resolveArtifactPath(artifactRoot, scriptFile, "script file");
  const scriptStats = await stat(effectiveScriptPath);
  if (!scriptStats.isFile()) {
    throw new Error(`The beforeBuild hook script is not a file: ${effectiveScriptPath}`);
  }
  const effectiveWorkingDirectory = await resolveArtifactPath(
    artifactRoot,
    workingDirectory,
    "working directory",
    true,
  );
  const workingDirectoryStats = await stat(effectiveWorkingDirectory);
  if (!workingDirectoryStats.isDirectory()) {
    throw new Error(
      `The beforeBuild hook working directory is not a directory: ${effectiveWorkingDirectory}`,
    );
  }
  ensureNotAborted(context.signal);

  const profileName =
    typeof context.inputs.profileName === "string" ? context.inputs.profileName : "Build Profile";
  context.log(`Build Profile: ${profileName}`);
  context.log(`Input artifact: ${artifactRoot}`);
  context.log(`Script file: ${effectiveScriptPath}`);
  context.log(`Working directory: ${effectiveWorkingDirectory}`);
  context.log(`Running ${command} with ${parameters.length} argument(s).`);

  let exitCode = -1;
  let duration = 0;
  try {
    const result = await context.processes.execute(command, [effectiveScriptPath, ...parameters], {
      cwd: effectiveWorkingDirectory,
      signal: context.signal,
      onStdout: (chunk) => context.logStream("stdout", chunk),
      onStderr: (chunk) => context.logStream("stderr", chunk),
    });
    exitCode = result.exitCode ?? -1;
    duration = result.duration;
    ensureNotAborted(context.signal);
    if (exitCode !== 0 && failureMode === "fail") {
      throw new Error(`beforeBuild hook '${scriptFile}' exited with code ${exitCode}.`);
    }
    if (exitCode !== 0)
      context.log(
        `Warning: beforeBuild hook '${scriptFile}' exited with code ${exitCode}; continuing.`,
      );
  } catch (error) {
    if (context.signal.aborted || (error instanceof Error && error.name === "AbortError"))
      throw error;
    if (failureMode === "fail") throw error;
    const message = error instanceof Error ? error.message : String(error);
    context.logStream("stderr", message);
    context.log(`Warning: beforeBuild hook '${scriptFile}' could not complete; continuing.`);
  }

  ensureNotAborted(context.signal);
  if (context.step.artifacts?.output) context.setArtifact("output", artifactRoot);
  return { output: artifactRoot, exitCode, duration };
};

export { RELEASE_BEFORE_BUILD_TASK_ID };
