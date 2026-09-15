import { isAbsolute, resolve } from "node:path";
import type { WorkflowTask } from "../types";

export const RUN_COMMAND_TASK_ID = "fs:run";

const asString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`The ${name} input must be a non-empty string`);
  }
  return value;
};

const asArguments = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("The parameters input must be an array of strings");
  }
  return value;
};

export const runCommandTask: WorkflowTask = async ({
  inputs,
  workspace,
  filesystem,
  processes,
  signal,
  log,
  logStream,
}) => {
  const command = asString(inputs.command, "command");
  const parameters = asArguments(inputs.parameters);
  const workingDirectoryInput = inputs.workingDirectory;
  const workingDirectory =
    typeof workingDirectoryInput === "string" && workingDirectoryInput.length > 0
      ? isAbsolute(workingDirectoryInput)
        ? workingDirectoryInput
        : resolve(workspace.root, workingDirectoryInput)
      : workspace.root;
  const stopOnError = inputs.stopOnError === true;

  await filesystem.ensureDirectory(workingDirectory);
  log(`Running ${command} ${parameters.join(" ")}`.trim());
  log(`Working directory: ${workingDirectory}`);

  try {
    const result = await processes.execute(command, parameters, {
      cwd: workingDirectory,
      signal,
      onStdout: (chunk) => logStream("stdout", chunk),
      onStderr: (chunk) => logStream("stderr", chunk),
    });

    const exitCode = result.exitCode ?? -1;
    if (stopOnError && exitCode !== 0) {
      throw new Error(`Command failed with exit code ${exitCode}`);
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode,
      duration: result.duration,
    };
  } catch (error) {
    if (signal.aborted || stopOnError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    logStream("stderr", message);
    return {
      stdout: "",
      stderr: message,
      exitCode: -1,
      duration: 0,
    };
  }
};
