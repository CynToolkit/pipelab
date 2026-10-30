import {
  PipelabContext,
  executeWorkflow,
  ReleasePersistence,
  buildCoreReleaseRegistry,
  loadStrictProjects,
  prepareReleaseWorkflow,
} from "@pipelab/core-node";
import {
  parseReleaseConfig,
  type ReleaseConfig,
  type ReleaseFieldDefinition,
  type SaveLocationWorkflow,
} from "@pipelab/shared";
import { Listr, ListrTaskState, type ListrTask, type ListrTaskWrapper } from "listr2";
import type { WorkflowEvent } from "@pipelab/workflow-runtime";
import { Option } from "commander";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { getDefaultUserDataPath } from "../paths";
import { parseWorkflowConnectionOverrides } from "./workflow-connection-overrides";
import { createWorkflowTaskGroups, type WorkflowStepTask } from "./workflow-task-groups";
import { workflowStepTitle } from "./workflow-task-title";
import { workflowTaskOutputLines } from "./workflow-task-output";

export const formatWorkflowStepElapsed = (durationMs: number) =>
  durationMs < 1_000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1_000).toFixed(2)} s`;

const contextFor = (userDataPath = getDefaultUserDataPath()) =>
  new PipelabContext({ userDataPath });

export const createWorkflowListr = (
  title: string,
  stepTasks: ListrTask[],
  execution: Promise<unknown>,
  onWorkflowTask: (task: ListrTaskWrapper<any, any, any>) => void = () => undefined,
  onExecutionFailure: (error: unknown) => void = () => undefined,
) => {
  void execution.catch(onExecutionFailure);
  return new Listr(
    [
      {
        title,
        task: (_ctx: unknown, task: ListrTaskWrapper<any, any, any>) => {
          onWorkflowTask(task);
          return task.newListr(
            [
              {
                title: "Workflow steps",
                task: (_ctx: unknown, steps: ListrTaskWrapper<any, any, any>) =>
                  steps.newListr(stepTasks, {
                    concurrent: true,
                    exitOnError: false,
                    rendererOptions: {
                      collapseErrors: false,
                      collapseSubtasks: false,
                      outputBar: 1,
                      showErrorMessage: true,
                    },
                  }),
              },
              { title: "Workflow result", task: () => execution },
            ],
            {
              concurrent: false,
              exitOnError: true,
              rendererOptions: {
                collapseErrors: false,
                collapseSubtasks: false,
                outputBar: 1,
                showErrorMessage: true,
              },
            },
          );
        },
      },
    ],
    {
      concurrent: true,
      exitOnError: true,
      rendererOptions: {
        collapseErrors: false,
        collapseSubtasks: false,
        outputBar: 1,
        showErrorMessage: true,
      },
    },
  );
};

export const workflowRunOptions = [
  new Option("--user-data <path>", "Custom user-data directory"),
  new Option("-o, --output <path>", "Path to write the result file"),
  new Option("--dry-run", "Validate the workflow without executing deployments"),
  new Option(
    "--skip-persistence",
    "Use temporary files instead of saving run history, outputs, or package/cache data",
  ),
  new Option("--fail-on-error", "Exit nonzero when a deployment fails"),
  new Option("-v, --verbose", "Show workflow logs after completion"),
  new Option("--connection <alias.field=VALUE>", "Override a Connection field for this run")
    .argParser((value, previous: string[] = []) => [...previous, value])
    .default([]),
];

export const workflowUserDataOption = () =>
  new Option("--user-data <path>", "Custom user-data directory");

const workflowEntries = async (context: PipelabContext) => {
  const repo = await loadStrictProjects(context);
  return repo.workflows || [];
};

const findEntry = async (context: PipelabContext, id: string) => {
  const entries = await workflowEntries(context);
  const persistence = new ReleasePersistence(context);
  const matches = entries.filter((entry) => entry.id === id);
  if (!matches.length) {
    for (const entry of entries) {
      const flow = (await persistence.loadWithProject(entry.id, entry.project)).config;
      if (flow.name === id) matches.push(entry);
    }
  }
  if (matches.length > 1)
    throw new Error(
      `Workflow name "${id}" is ambiguous: ${matches.map((entry) => entry.id).join(", ")}`,
    );
  return matches[0];
};

const loadEntry = async (context: PipelabContext, id: string) => {
  const entry = await findEntry(context, id);
  if (!entry) throw new Error(`Workflow "${id}" not found`);
  return entry;
};

const loadWorkflow = async (context: PipelabContext, entry: SaveLocationWorkflow) =>
  (await new ReleasePersistence(context).loadWithProject(entry.id, entry.project)).config;

const isWorkflowFileArgument = (value: string) =>
  value.startsWith(".") || isAbsolute(value) || value.includes("/") || value.includes("\\");

const resolveConfiguredPaths = (
  fields: ReleaseFieldDefinition[] | undefined,
  values: Record<string, unknown>,
  baseDirectory: string,
) => {
  for (const field of fields ?? []) {
    if (field.type !== "file" && field.type !== "directory") continue;
    const value = values[field.key];
    if (typeof value !== "string" || !value || value.startsWith("${{") || isAbsolute(value))
      continue;
    values[field.key] = resolve(baseDirectory, value);
  }
};

const resolveWorkflowFilePaths = (config: ReleaseConfig, baseDirectory: string) => {
  const registry = buildCoreReleaseRegistry();
  const source = registry.sources.find((candidate) => candidate.id === config.source.provider);
  resolveConfiguredPaths(source?.fields, config.source.config, baseDirectory);

  for (const build of config.builds) {
    const producer = registry.producers.find((candidate) => candidate.id === build.engine);
    resolveConfiguredPaths(producer?.fields, build.config, baseDirectory);
    for (const target of build.targets) {
      const definition = producer?.targets.find((candidate) => candidate.id === target.id);
      resolveConfiguredPaths(definition?.fields, target.config, baseDirectory);
    }
  }

  for (const destination of config.destinations) {
    const definition = registry.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    resolveConfiguredPaths(definition?.fields, destination.config, baseDirectory);
    for (const slot of destination.slots) {
      resolveConfiguredPaths(definition?.slotFields, slot.config, baseDirectory);
    }
  }
};

const validateWorkflowSourcePath = async (config: ReleaseConfig) => {
  const source = buildCoreReleaseRegistry().sources.find(
    (candidate) => candidate.id === config.source.provider,
  );
  const field = source?.fields?.find(
    (candidate) =>
      candidate.required && (candidate.type === "file" || candidate.type === "directory"),
  );
  if (!field) return;

  const path = config.source.config[field.key];
  if (typeof path !== "string" || !path || path.includes("${{")) return;

  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") {
      throw new Error(`Workflow source path does not exist: ${path}`);
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Unable to inspect workflow source path '${path}': ${detail}`);
  }
  if (field.type === "file" && !info.isFile())
    throw new Error(`Workflow source file path is not a file: ${path}`);
  if (field.type === "directory" && !info.isDirectory())
    throw new Error(`Workflow source directory path is not a directory: ${path}`);
};

const loadWorkflowFile = async (path: string): Promise<ReleaseConfig> => {
  let contents: string;
  try {
    contents = await readFile(resolve(path), "utf8");
  } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") {
      throw new Error(`Workflow file '${path}' was not found.`);
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Unable to read workflow file '${path}': ${detail}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Workflow file '${path}' is not valid JSON: ${detail}`);
  }

  let config: ReleaseConfig;
  try {
    config = parseReleaseConfig(value);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Workflow file '${path}' is not a supported Release Workflow: ${detail}`);
  }

  resolveWorkflowFilePaths(config, dirname(resolve(path)));
  await validateWorkflowSourcePath(config);
  return config;
};

export async function listWorkflowsCommand(options: { userData?: string } = {}) {
  const context = contextFor(options.userData);
  const entries = await workflowEntries(context);
  const persistence = new ReleasePersistence(context);
  if (!entries.length) return console.log("No workflows found.");
  for (const entry of entries) {
    const flow = (await persistence.loadWithProject(entry.id, entry.project)).config;
    console.log(`${flow.name || "Unnamed workflow"} (${entry.id})`);
    console.log(`   Source: ${flow.source?.provider || "None"}`);
    console.log(
      `   Destinations: ${flow.destinations?.map((item) => item.provider).join(", ") || "None"}`,
    );
    console.log(`   Last modified: ${entry.lastModified || "Unknown"}`);
  }
}

export async function deleteWorkflowCommand(
  id: string,
  options: { force?: boolean; userData?: string },
) {
  if (!options.force) throw new Error("Deleting a workflow requires the --force flag.");
  const context = contextFor(options.userData);
  const persistence = new ReleasePersistence(context);
  await persistence.delete(id);
  console.log(`Deleted workflow "${id}".`);
}

export async function runWorkflowCommand(
  id: string,
  options: {
    userData?: string;
    output?: string;
    failOnError?: boolean;
    dryRun?: boolean;
    skipPersistence?: boolean;
    verbose?: boolean;
    connection?: readonly string[];
  },
) {
  const connectionOverrides = parseWorkflowConnectionOverrides(options.connection || []);
  const context = contextFor(options.userData);
  const savedEntry = isWorkflowFileArgument(id) ? undefined : await findEntry(context, id);
  const useWorkflowFile = isWorkflowFileArgument(id) || (!savedEntry && id.endsWith(".json"));
  const workflowInput = useWorkflowFile
    ? { kind: "file" as const, config: await loadWorkflowFile(id) }
    : { kind: "saved" as const, entry: savedEntry ?? (await loadEntry(context, id)) };
  const flow =
    workflowInput.kind === "file"
      ? workflowInput.config
      : await loadWorkflow(context, workflowInput.entry);
  const prepared = prepareReleaseWorkflow(flow);
  if (connectionOverrides.some((override) => override.value.kind === "literal")) {
    console.warn(
      "Warning: literal --connection values may appear in shell history and process listings. Use env:VARIABLE for secrets.",
    );
  }
  if (options.dryRun) {
    console.log(
      `Dry run for ${id}: ${flow.builds.length} build profile(s), ${flow.destinations.length} destination(s)`,
    );
    if (options.output) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        options.output,
        JSON.stringify(
          {
            type: "workflow-dry-run",
            config: prepared.config,
            plan: prepared.plan,
            workflow: prepared.workflow,
          },
          null,
          2,
        ),
      );
    }
    return;
  }
  const workflow = prepared.workflow;
  const completion = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const waiters = new Map<string, Promise<void>>();
  const settledSteps = new Set<string>();
  const taskControls = new Map<string, ListrTaskWrapper<any, any, any>>();
  const taskStates = new Map<string, ListrTaskState>();
  const taskLogs = new Map<string, string[]>();
  const taskStartedAt = new Map<string, number>();
  const taskElapsed = new Map<string, number>();
  const taskTimers = new Map<string, ReturnType<typeof setInterval>>();
  const workflowTitle = flow.name || "Workflow";
  let workflowTaskControl: ListrTaskWrapper<any, any, any> | undefined;
  const workflowStartedAt = performance.now();
  const updateWorkflowTitle = (durationMs = performance.now() - workflowStartedAt) => {
    if (workflowTaskControl) {
      workflowTaskControl.task.title = `${workflowTitle} · ${formatWorkflowStepElapsed(durationMs)}`;
    }
  };
  const workflowTimer = process.stdout.isTTY
    ? setInterval(() => updateWorkflowTitle(), 100)
    : undefined;
  const workflowLogs: Array<{ stepTitle: string; message: string }> = [];
  const updateTask = (stepId: string, state: ListrTaskState) => {
    taskStates.set(stepId, state);
    const task = taskControls.get(stepId);
    if (task) task.task.state$ = state;
  };
  const updateTaskTitle = (stepId: string, durationMs: number) => {
    taskElapsed.set(stepId, durationMs);
    const task = taskControls.get(stepId);
    const title = stepTitleById.get(stepId);
    // Let Listr2's renderer cadence redraw the latest title without forcing a render per timer tick.
    if (task && title) {
      task.task.title = `${title} · ${formatWorkflowStepElapsed(durationMs)}`;
    }
  };
  const clearTaskTimer = (stepId: string) => {
    const timer = taskTimers.get(stepId);
    if (timer) clearInterval(timer);
    taskTimers.delete(stepId);
  };
  const startTaskTimer = (stepId: string) => {
    clearTaskTimer(stepId);
    const startedAt = performance.now();
    taskStartedAt.set(stepId, startedAt);
    updateTaskTitle(stepId, 0);
    if (process.stdout.isTTY) {
      taskTimers.set(
        stepId,
        setInterval(() => updateTaskTitle(stepId, performance.now() - startedAt), 100),
      );
    }
  };
  const finishTaskTimer = (stepId: string, durationMs?: number) => {
    clearTaskTimer(stepId);
    const startedAt = taskStartedAt.get(stepId);
    const elapsed =
      durationMs ??
      (startedAt === undefined ? taskElapsed.get(stepId) : performance.now() - startedAt);
    taskStartedAt.delete(stepId);
    if (elapsed !== undefined) updateTaskTitle(stepId, elapsed);
    return elapsed;
  };
  const clearTaskOutput = (stepId: string) => {
    taskLogs.delete(stepId);
    const task = taskControls.get(stepId);
    if (task) task.output = "";
  };
  const updateTaskOutput = (stepId: string, output: string) => {
    const lines = [...(taskLogs.get(stepId) || []), ...workflowTaskOutputLines(output)].slice(-1);
    taskLogs.set(stepId, lines);
    const task = taskControls.get(stepId);
    if (task) for (const line of workflowTaskOutputLines(output)) task.output = line;
  };
  const printWorkflowLogs = () => {
    if (!options.verbose || workflowLogs.length === 0) return;
    console.log("\nWorkflow logs:");
    for (const { stepTitle, message } of workflowLogs) {
      for (const line of workflowTaskOutputLines(message)) console.log(`[${stepTitle}] ${line}`);
    }
  };
  const waitFor = (stepId: string) => {
    const existing = waiters.get(stepId);
    if (existing) return existing;
    const promise = new Promise<void>((resolve, reject) =>
      completion.set(stepId, { resolve, reject }),
    );
    void promise.catch(() => undefined);
    waiters.set(stepId, promise);
    return promise;
  };
  const stepTasks = workflow.steps.map((step) => ({
    id: step.id,
    step,
    title: workflowStepTitle(step),
  }));
  const stepTitleById = new Map<string, string>(
    stepTasks.map((step) => [step.id, step.title] as const),
  );
  const stepTask = (step: WorkflowStepTask) => {
    stepTitleById.set(step.id, step.title);
    return {
      title: step.title,
      rendererOptions: { outputBar: 1 },
      task: (_ctx: unknown, task: ListrTaskWrapper<any, any, any>) => {
        taskControls.set(step.id, task);
        task.task.state$ = taskStates.get(step.id) || ListrTaskState.WAITING;
        const startedAt = taskStartedAt.get(step.id);
        const elapsed = taskElapsed.get(step.id);
        if (startedAt !== undefined) updateTaskTitle(step.id, performance.now() - startedAt);
        else if (elapsed !== undefined) updateTaskTitle(step.id, elapsed);
        const lines = taskLogs.get(step.id);
        if (lines?.length) for (const line of lines) task.output = line;
        return waitFor(step.id);
      },
    };
  };
  const taskGroups = createWorkflowTaskGroups(
    stepTasks,
    prepared.config,
    prepared.plan,
    prepared.registry,
    stepTask,
  );
  for (const task of stepTasks) waitFor(task.id);
  const originalConsoleDebug = console.debug;
  if (!options.verbose) console.debug = () => undefined;
  const execution = executeWorkflow(context, `workflows/${flow.id}.json`, {
    release: { version: "", description: "" },
    ...(workflowInput.kind === "file" ? { workflowConfig: workflowInput.config } : {}),
    connectionOverrides,
    persist: !options.skipPersistence,
    logger: {
      info: () => undefined,
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    },
    onEvent: (event: WorkflowEvent) => {
      if (event.type === "step.started") {
        startTaskTimer(event.stepId);
        updateTask(event.stepId, ListrTaskState.STARTED);
      } else if (event.type === "step.log") {
        if (options.verbose) {
          workflowLogs.push({
            stepTitle: stepTitleById.get(event.stepId) || event.stepId,
            message: event.message,
          });
        }
        if (process.stdout.isTTY) updateTaskOutput(event.stepId, event.message);
        updateTask(event.stepId, taskStates.get(event.stepId) || ListrTaskState.STARTED);
      } else if (event.type === "step.completed") {
        settledSteps.add(event.stepId);
        finishTaskTimer(event.stepId, event.duration);
        clearTaskOutput(event.stepId);
        updateTask(event.stepId, ListrTaskState.COMPLETED);
        completion.get(event.stepId)?.resolve();
      } else if (event.type === "step.failed") {
        settledSteps.add(event.stepId);
        finishTaskTimer(event.stepId, event.duration);
        clearTaskOutput(event.stepId);
        updateTask(event.stepId, ListrTaskState.FAILED);
        const task = taskControls.get(event.stepId);
        if (task) {
          task.task.message$ = {
            error: workflowTaskOutputLines(event.error.message)[0] || "Workflow step failed",
          };
        }
        completion.get(event.stepId)?.reject(new Error(event.error.message));
      } else if (event.type === "step.skipped") {
        settledSteps.add(event.stepId);
        finishTaskTimer(event.stepId);
        updateTaskOutput(event.stepId, `Skipped (blocked by ${event.blockedBy.join(", ")})`);
        updateTask(event.stepId, ListrTaskState.SKIPPED);
        completion.get(event.stepId)?.resolve();
      }
    },
  });
  void execution
    .finally(() => {
      if (workflowTimer) clearInterval(workflowTimer);
      updateWorkflowTitle();
      console.debug = originalConsoleDebug;
    })
    .catch(() => undefined);
  const listr = createWorkflowListr(
    workflowTitle,
    taskGroups,
    execution,
    (task) => {
      workflowTaskControl = task;
      updateWorkflowTitle();
    },
    (error) => {
      if (workflowTaskControl) {
        const message = error instanceof Error ? error.message : String(error);
        workflowTaskControl.task.message$ = {
          error: workflowTaskOutputLines(message)[0] || "Workflow failed",
        };
        workflowTaskControl.task.state$ = ListrTaskState.FAILED;
      }
      for (const step of stepTasks) {
        if (settledSteps.has(step.id)) continue;
        finishTaskTimer(step.id);
        updateTaskOutput(step.id, "Not started because workflow execution failed");
        updateTask(step.id, ListrTaskState.SKIPPED);
        settledSteps.add(step.id);
        completion.get(step.id)?.resolve();
      }
    },
  );
  const listRun = listr.run();
  const result = await execution.catch(async (error: unknown) => {
    await listRun.catch(() => undefined);
    printWorkflowLogs();
    throw error;
  });
  await listRun;
  printWorkflowLogs();
  if (options.output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      options.output,
      JSON.stringify({ result: result.safeResult, runId: result.runId }, null, 2),
    );
  }
  if (options.failOnError && result.result.status === "completed-with-errors") {
    throw new Error("Workflow completed with errors");
  }
}
