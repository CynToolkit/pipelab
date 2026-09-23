import {
  PipelabContext,
  ReleasePersistence,
  loadStrictProjects,
  prepareReleaseWorkflow,
} from "@pipelab/core-node";
import type { SaveLocationWorkflow } from "@pipelab/shared";
import { executeWorkflow } from "../../../../packages/core-node/src/handlers/workflow";
import { Listr, ListrTaskState, type ListrTaskWrapper } from "listr2";
import type { WorkflowEvent } from "../../../../packages/workflow-runtime/src/index";
import { Option } from "commander";
import { getDefaultUserDataPath } from "../paths";

const contextFor = (userDataPath = getDefaultUserDataPath()) =>
  new PipelabContext({ userDataPath });

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
  const { builtInPlugins } = await import("@pipelab/core-node");
  await builtInPlugins({ context });
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
  const { builtInPlugins } = await import("@pipelab/core-node");
  await builtInPlugins({ context });
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
  const taskControls = new Map<string, ListrTaskWrapper<any, any, any>>();
  const taskStates = new Map<string, ListrTaskState>();
  const taskLogs = new Map<string, string[]>();
  const updateTask = (stepId: string, state: ListrTaskState, log?: string) => {
    taskStates.set(stepId, state);
    if (log) {
      const lines = [...(taskLogs.get(stepId) || []), ...log.split("\n")].slice(-5);
      taskLogs.set(stepId, lines);
      const task = taskControls.get(stepId);
      if (task) for (const line of log.split("\n")) task.output = line;
    }
    const task = taskControls.get(stepId);
    if (task) task.task.state$ = state;
  };
  const waitFor = (stepId: string) => {
    const existing = waiters.get(stepId);
    if (existing) return existing;
    const promise = new Promise<void>((resolve, reject) =>
      completion.set(stepId, { resolve, reject }),
    );
    waiters.set(stepId, promise);
    return promise;
  };
  const stepGroups = [
    {
      id: "workflow",
      title: flow.name,
      steps: workflow.steps.map((step) => ({ id: step.id, title: step.id })),
    },
  ];
  const stepTasks = stepGroups.flatMap((group) => group.steps);
  const stepTask = (step: (typeof stepTasks)[number]) => ({
    title: step.title,
    rendererOptions: { outputBar: 5, persistentOutput: false },
    task: (_ctx: unknown, task: ListrTaskWrapper<any, any, any>) => {
      taskControls.set(step.id, task);
      task.task.state$ = taskStates.get(step.id) || ListrTaskState.PAUSED;
      const lines = taskLogs.get(step.id);
      if (lines?.length) for (const line of lines) task.output = line;
      return waitFor(step.id);
    },
  });
  waitFor("__workflow__");
  for (const task of stepTasks) waitFor(task.id);
  const execution = executeWorkflow(context, `workflows/${entry.id}`, {
    release: { version: "", description: "" },
    prepared,
    onEvent: (event: WorkflowEvent) => {
      if (event.type === "step.started") updateTask(event.stepId, ListrTaskState.STARTED);
      if (event.type === "step.log")
        updateTask(
          event.stepId,
          taskStates.get(event.stepId) || ListrTaskState.STARTED,
          event.message,
        );
      if (event.type === "step.completed") {
        updateTask(event.stepId, ListrTaskState.COMPLETED);
        completion.get(event.stepId)?.resolve();
      }
      if (event.type === "step.failed") {
        updateTask(event.stepId, ListrTaskState.FAILED, event.error.message);
        const task = taskControls.get(event.stepId);
        if (task) {
          task.task.message$ = {
            error: (taskLogs.get(event.stepId) || []).join("\n"),
          };
        }
        completion.get(event.stepId)?.reject(new Error(event.error.message));
      }
      if (event.type === "step.skipped") {
        updateTask(
          event.stepId,
          ListrTaskState.SKIPPED,
          `Skipped (blocked by ${event.blockedBy.join(", ")})`,
        );
        completion.get(event.stepId)?.resolve();
      }
    },
  });
  const listr = new Listr(
    [
      { title: "Workflow", task: () => waitFor("__workflow__") },
      ...stepGroups.map((group) =>
        group.steps.length === 1
          ? stepTask(group.steps[0])
          : {
              title: group.title,
              task: (_ctx: unknown, task: ListrTaskWrapper<any, any, any>) =>
                task.newListr(group.steps.map(stepTask), {
                  concurrent: true,
                  exitOnError: false,
                  rendererOptions: { collapseErrors: false, showErrorMessage: true },
                }),
            },
      ),
    ],
    {
      concurrent: true,
      exitOnError: false,
      rendererOptions: { collapseErrors: false, showErrorMessage: true },
    },
  );
  const listRun = listr.run();
  execution.then(
    () => completion.get("__workflow__")?.resolve(),
    (error: unknown) => {
      for (const waiter of completion.values())
        waiter.reject(error instanceof Error ? error : new Error(String(error)));
    },
  );
  const result = await execution;
  completion.get("__workflow__")?.resolve();
  await listRun;
  if (options.output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(options.output, JSON.stringify(result, null, 2));
  }
  if (options.failOnError && result.result.status === "completed-with-errors") {
    throw new Error("Workflow completed with errors");
  }
}
