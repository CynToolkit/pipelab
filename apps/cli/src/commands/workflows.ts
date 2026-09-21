import {
  deleteWorkflowConfigFileByName,
  PipelabContext,
  setupProjectsConfigFile,
  setupWorkflowConfigFileByName,
} from "@pipelab/core-node";
import { executeWorkflow } from "../../../../packages/core-node/src/handlers/workflow";
import { Listr, ListrTaskState, type ListrTaskWrapper } from "listr2";
import type { WorkflowEvent } from "../../../../packages/workflow-runtime/src/index";
import { Option } from "commander";
import { getDefaultUserDataPath } from "../paths";
import { buildReleaseRegistry, compileWorkflow, usePlugins } from "@pipelab/shared";

const contextFor = (userDataPath = getDefaultUserDataPath()) =>
  new PipelabContext({ userDataPath });

export const workflowRunOptions = [
  new Option("--user-data <path>", "Custom user-data directory"),
  new Option("-o, --output <path>", "Path to write the result file"),
  new Option("--dry-run", "Validate the workflow without executing deployments"),
  new Option("--fail-on-error", "Exit nonzero when a deployment fails"),
  new Option("-v, --verbose", "Show workflow logs after completion"),
];

const workflowEntries = async (context: PipelabContext) => {
  const repo = await (await setupProjectsConfigFile(context)).getConfig();
  return repo.workflows || [];
};

const loadEntry = async (context: PipelabContext, id: string) => {
  const entries = await workflowEntries(context);
  const matches = entries.filter((entry) => entry.id === id);
  if (!matches.length) {
    for (const entry of entries) {
      const flow = await (
        await setupWorkflowConfigFileByName(entry.configName, context)
      ).getConfig();
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

export async function listWorkflowsCommand() {
  const context = contextFor();
  const entries = await workflowEntries(context);
  if (!entries.length) return console.log("No workflows found.");
  for (const entry of entries) {
    const flow = await (await setupWorkflowConfigFileByName(entry.configName, context)).getConfig();
    console.log(`${flow.name || "Unnamed workflow"} (${entry.id})`);
    console.log(`   Source: ${flow.source?.provider || "None"}`);
    console.log(
      `   Destinations: ${flow.destinations?.map((item) => item.provider).join(", ") || "None"}`,
    );
    console.log(`   Last modified: ${entry.lastModified || "Unknown"}`);
  }
}

export async function deleteWorkflowCommand(id: string, options: { force?: boolean }) {
  if (!options.force) throw new Error("Deleting a workflow requires the --force flag.");
  const context = contextFor();
  const projects = await setupProjectsConfigFile(context);
  const repo = await projects.getConfig();
  const index = repo.workflows?.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) throw new Error(`Workflow "${id}" not found`);
  const entry = repo.workflows![index];
  await deleteWorkflowConfigFileByName(entry.configName, context);
  repo.workflows!.splice(index, 1);
  await projects.setConfig(repo);
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
  const flow = await (await setupWorkflowConfigFileByName(entry.configName, context)).getConfig();
  if (options.dryRun) {
    console.log(
      `Dry run for ${id}: ${flow.builds.length} build profile(s), ${flow.destinations.length} destination(s)`,
    );
    if (options.output) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(options.output, JSON.stringify(flow, null, 2));
    }
    return;
  }
  const { builtInPlugins } = await import("@pipelab/core-node");
  await builtInPlugins({ context });
  const workflow = compileWorkflow(flow, buildReleaseRegistry(usePlugins().plugins.value), {
    host: { platform: process.platform, architecture: process.arch },
  });
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
  const execution = executeWorkflow(context, entry.configName, {
    release: { version: "", description: "" },
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
