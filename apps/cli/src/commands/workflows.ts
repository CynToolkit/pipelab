import {
  PipelabContext,
  ReleasePersistence,
  loadStrictProjects,
  prepareReleaseWorkflow,
} from "@pipelab/core-node";
import type { SaveLocationWorkflow } from "@pipelab/shared";
import { executeWorkflow } from "../../../../packages/core-node/src/handlers/workflow";
import { Listr, ListrTaskState, type ListrTask, type ListrTaskWrapper } from "listr2";
import type { WorkflowEvent } from "../../../../packages/workflow-runtime/src/index";
import { Option } from "commander";
import { getDefaultUserDataPath } from "../paths";
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
  new Option("--fail-on-error", "Exit nonzero when a deployment fails"),
  new Option("-v, --verbose", "Show workflow logs after completion"),
];

export const workflowUserDataOption = () =>
  new Option("--user-data <path>", "Custom user-data directory");

const workflowEntries = async (context: PipelabContext) => {
  const repo = await loadStrictProjects(context);
  return repo.workflows || [];
};

const loadEntry = async (context: PipelabContext, id: string) => {
  const entries = await workflowEntries(context);
  const persistence = new ReleasePersistence(context);
  const matches = entries.filter((entry) => entry.id === id);
  if (!matches.length) {
    for (const entry of entries) {
      const flow = (await persistence.loadWithProject(entry.id, entry.project)).config;
      if (flow.name === id) matches.push(entry);
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      matches.length > 1
        ? `Workflow name "${id}" is ambiguous: ${matches.map((entry) => entry.id).join(", ")}`
        : `Workflow "${id}" not found`,
    );
  }
  return matches[0];
};

const loadWorkflow = async (context: PipelabContext, entry: SaveLocationWorkflow) =>
  (await new ReleasePersistence(context).loadWithProject(entry.id, entry.project)).config;

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
    verbose?: boolean;
  },
) {
  const context = contextFor(options.userData);
  const entry = await loadEntry(context, id);
  const flow = await loadWorkflow(context, entry);
  const prepared = prepareReleaseWorkflow(flow);
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
    ? setInterval(() => updateWorkflowTitle(), 0)
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
        setInterval(() => updateTaskTitle(stepId, performance.now() - startedAt), 0),
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
  const execution = executeWorkflow(context, `workflows/${entry.id}`, {
    release: { version: "", description: "" },
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
    await writeFile(options.output, JSON.stringify(result, null, 2));
  }
  if (options.failOnError && result.result.status === "completed-with-errors") {
    throw new Error("Workflow completed with errors");
  }
}
