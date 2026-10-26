import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ListrTaskState, type ListrTask } from "listr2";
import { createSandbox } from "@pipelab/test-utils";
import { createReleaseConfig, type ReleaseConfig } from "@pipelab/shared";
import type { WorkflowResult } from "@pipelab/workflow-runtime";
import * as coreNode from "@pipelab/core-node";
import {
  createWorkflowListr,
  formatWorkflowStepElapsed,
  runWorkflowCommand,
} from "../../../src/commands/workflows";

const status = (listr: ReturnType<typeof createWorkflowListr>, title: string) => {
  const root = listr.tasks[0];
  const stepsGroup = root.subtasks[0];
  return stepsGroup.subtasks.find((task) => task.title === title)?.state;
};

const step = (title: string, task: ListrTask["task"]): ListrTask => ({ title, task });

const persistWorkflowFixture = async (
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  config: ReleaseConfig,
) => {
  const configRoot = join(sandbox.paths.userData, "config");
  await mkdir(join(configRoot, "workflows"), { recursive: true });
  await writeFile(
    join(configRoot, "projects.json"),
    JSON.stringify({
      version: "4.0.0",
      projects: [{ id: config.project, name: "CLI test", description: "" }],
      workflows: [
        {
          id: config.id,
          project: config.project,
          lastModified: "2026-01-01T00:00:00.000Z",
          type: "internal-workflow",
          configName: `workflows/${config.id}`,
        },
      ],
    }),
  );
  await writeFile(join(configRoot, "workflows", `${config.id}.json`), JSON.stringify(config));
};

describe("workflow CLI result output", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await sandbox?.remove();
    sandbox = undefined;
  });

  test("dry-runs a Release Workflow JSON file without a saved workflow index entry", async () => {
    sandbox = await createSandbox("workflow-file-dry-run");
    const config = createReleaseConfig({
      id: "portable-release",
      project: "ci-project",
      name: "Portable release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: sandbox.path },
      },
    });
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, JSON.stringify(config));
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runWorkflowCommand(workflowFile, {
      userData: sandbox.paths.userData,
      dryRun: true,
    });

    expect(output).toHaveBeenCalledWith(
      `Dry run for ${workflowFile}: 0 build profile(s), 0 destination(s)`,
    );
  });

  test.each([
    { description: "ID", id: "nightly.json", name: "Nightly" },
    { description: "name", id: "nightly-release", name: "nightly.json" },
  ])("runs a saved workflow when its $description ends in .json", async ({ id, name }) => {
    sandbox = await createSandbox(`workflow-saved-${id.replaceAll(".", "-")}`);
    const config = createReleaseConfig({
      id,
      project: "cli-project",
      name,
      source: { provider: "@pipelab/core/source/folder", config: { path: sandbox.path } },
    });
    await persistWorkflowFixture(sandbox, config);
    const identifier = id.endsWith(".json") ? id : name;
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runWorkflowCommand(identifier, {
      userData: sandbox.paths.userData,
      dryRun: true,
    });

    expect(output).toHaveBeenCalledWith(
      `Dry run for ${identifier}: 0 build profile(s), 0 destination(s)`,
    );
  });

  test("preserves a portable workflow ID ending in .json at the runtime boundary", async () => {
    sandbox = await createSandbox("workflow-file-id-json-suffix");
    const sourceDirectory = join(sandbox.path, "source");
    await mkdir(sourceDirectory);
    await writeFile(join(sourceDirectory, "game.txt"), "game");
    const config = createReleaseConfig({
      id: "portable-release.json",
      project: "ci-project",
      name: "Portable release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: sourceDirectory },
      },
    });
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, JSON.stringify(config));
    const result: WorkflowResult = {
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {
        "release-folder-source": {
          id: "release-folder-source",
          uses: "filesystem:copy",
          status: "completed",
          outputs: {},
          artifacts: [],
          startedAt: 0,
          completedAt: 1,
          duration: 1,
        },
      },
    };
    let submittedName: string | undefined;
    let submittedConfig: unknown;
    vi.spyOn(coreNode, "executeWorkflow").mockImplementation(async (_context, name, options) => {
      submittedName = name;
      submittedConfig = options?.workflowConfig;
      options?.onEvent?.({
        type: "step.started",
        stepId: "release-folder-source",
        uses: "filesystem:copy",
        timestamp: 1,
      });
      options?.onEvent?.({
        type: "step.completed",
        stepId: "release-folder-source",
        uses: "filesystem:copy",
        outputs: {},
        artifacts: [],
        duration: 1,
        timestamp: 2,
      });
      return { result, safeResult: result, runId: "run-json-suffix" };
    });

    await runWorkflowCommand(workflowFile, { userData: sandbox.paths.userData });

    expect(submittedName).toBe("workflows/portable-release.json.json");
    expect(submittedConfig).toEqual(config);
  });

  test("warns about literal Connection values before returning from dry-run", async () => {
    sandbox = await createSandbox("workflow-dry-run-literal-warning");
    const config = createReleaseConfig({
      id: "portable-release",
      project: "ci-project",
      name: "Portable release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: sandbox.path },
      },
    });
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, JSON.stringify(config));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runWorkflowCommand(workflowFile, {
      userData: sandbox.paths.userData,
      dryRun: true,
      connection: ["publish.apiKey=literal:secret-value"],
    });

    expect(warning).toHaveBeenCalledWith(
      "Warning: literal --connection values may appear in shell history and process listings. Use env:VARIABLE for secrets.",
    );
    expect(warning.mock.calls.flat().join(" ")).not.toContain("secret-value");
  });

  test("reports a missing JSON workflow file with a direct path error", async () => {
    sandbox = await createSandbox("workflow-file-missing");
    const workflowFile = join(sandbox.path, "missing.json");

    await expect(
      runWorkflowCommand(workflowFile, {
        userData: sandbox.paths.userData,
        dryRun: true,
      }),
    ).rejects.toThrow(`Workflow file '${workflowFile}' was not found.`);
  });

  test("reports malformed workflow JSON with file context", async () => {
    sandbox = await createSandbox("workflow-file-invalid-json");
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, "{ invalid");

    await expect(
      runWorkflowCommand(workflowFile, {
        userData: sandbox.paths.userData,
        dryRun: true,
      }),
    ).rejects.toThrow(`Workflow file '${workflowFile}' is not valid JSON`);
  });

  test("rejects an unsupported workflow file schema with file context", async () => {
    sandbox = await createSandbox("workflow-file-unsupported-schema");
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(
      workflowFile,
      JSON.stringify({
        version: "99.0.0",
        id: "portable-release",
        project: "ci-project",
        name: "Portable release",
        source: { provider: "@pipelab/core/source/folder", config: { path: sandbox.path } },
        builds: [],
        destinations: [],
      }),
    );

    await expect(
      runWorkflowCommand(workflowFile, {
        userData: sandbox.paths.userData,
        dryRun: true,
      }),
    ).rejects.toThrow(`Workflow file '${workflowFile}' is not a supported Release Workflow`);
  });

  test("reports an unknown source provider in a portable workflow file", async () => {
    sandbox = await createSandbox("workflow-file-unknown-source");
    const config = createReleaseConfig({
      id: "portable-release",
      project: "ci-project",
      name: "Portable release",
      source: { provider: "missing/source", config: {} },
    });
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, JSON.stringify(config));

    await expect(
      runWorkflowCommand(workflowFile, {
        userData: sandbox.paths.userData,
        dryRun: true,
      }),
    ).rejects.toThrow("Unknown source provider: missing/source");
  });

  test("rejects a missing relative source path before workflow execution", async () => {
    sandbox = await createSandbox("workflow-file-invalid-source");
    const config = createReleaseConfig({
      id: "portable-release",
      project: "ci-project",
      name: "Portable release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "./missing-source" },
      },
    });
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, JSON.stringify(config));

    await expect(
      runWorkflowCommand(workflowFile, {
        userData: sandbox.paths.userData,
        dryRun: true,
      }),
    ).rejects.toThrow(
      `Workflow source path does not exist: ${join(sandbox.path, "missing-source")}`,
    );
  });

  test("resolves relative provider paths against the workflow file directory", async () => {
    sandbox = await createSandbox("workflow-file-relative-source");
    const config = createReleaseConfig({
      id: "portable-release",
      project: "ci-project",
      name: "Portable release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "./source" },
      },
    });
    const workflowFile = join(sandbox.path, "release.json");
    const outputFile = join(sandbox.path, "dry-run.json");
    await mkdir(join(sandbox.path, "source"));
    await writeFile(workflowFile, JSON.stringify(config));

    await runWorkflowCommand(workflowFile, {
      userData: sandbox.paths.userData,
      dryRun: true,
      output: outputFile,
    });

    const output = JSON.parse(await readFile(outputFile, "utf8"));
    expect(output.config.source.config.path).toBe(join(sandbox.path, "source"));
  });

  test("runs a workflow file with an environment reference inside its relative source path", async () => {
    sandbox = await createSandbox("workflow-file-embedded-environment-path");
    const sourceDirectory = join(sandbox.path, "builds", "release");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "game.txt"), "game");
    const config = createReleaseConfig({
      id: "portable-release",
      project: "ci-project",
      name: "Portable release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "./builds/${{ env.BUILD_VERSION }}" },
      },
    });
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, JSON.stringify(config));
    vi.stubEnv("BUILD_VERSION", "release");
    const result: WorkflowResult = {
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {
        "release-folder-source": {
          id: "release-folder-source",
          uses: "filesystem:copy",
          status: "completed",
          outputs: {},
          artifacts: [],
          startedAt: 0,
          completedAt: 1,
          duration: 1,
        },
      },
    };
    let submittedConfig: unknown;
    vi.spyOn(coreNode, "executeWorkflow").mockImplementation(
      async (_context, _configName, options) => {
        submittedConfig = options?.workflowConfig;
        options?.onEvent?.({
          type: "step.started",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          timestamp: 1,
        });
        options?.onEvent?.({
          type: "step.completed",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          outputs: {},
          artifacts: [],
          duration: 1,
          timestamp: 2,
        });
        return { result, safeResult: result, runId: "run-embedded-environment-path" };
      },
    );

    await runWorkflowCommand(workflowFile, { userData: sandbox.paths.userData });

    expect(submittedConfig).toMatchObject({
      source: {
        config: {
          path: join(sandbox.path, "builds", "${{ env.BUILD_VERSION }}"),
        },
      },
    });
  });

  test("submits a portable workflow file and its Connection mappings to shared execution", async () => {
    sandbox = await createSandbox("workflow-file-run");
    const config = createReleaseConfig({
      id: "portable-release",
      project: "ci-project",
      name: "Portable release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: sandbox.path },
      },
    });
    const workflowFile = join(sandbox.path, "release.json");
    await writeFile(workflowFile, JSON.stringify(config));
    const result: WorkflowResult = {
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {
        "release-folder-source": {
          id: "release-folder-source",
          uses: "filesystem:copy",
          status: "completed",
          outputs: {},
          artifacts: [],
          startedAt: 0,
          completedAt: 1,
          duration: 1,
        },
      },
    };
    let submittedConfig: unknown;
    let submittedOverrides: unknown;
    vi.spyOn(coreNode, "executeWorkflow").mockImplementation(
      async (_context, _configName, options) => {
        submittedConfig = options?.workflowConfig;
        submittedOverrides = options?.connectionOverrides;
        options?.onEvent?.({
          type: "step.started",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          timestamp: 1,
        });
        options?.onEvent?.({
          type: "step.completed",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          outputs: {},
          artifacts: [],
          duration: 1,
          timestamp: 2,
        });
        return { result, safeResult: result, runId: "run-portable-file" };
      },
    );

    await runWorkflowCommand(workflowFile, {
      userData: sandbox.paths.userData,
      connection: ["itch-production.apiKey=env:CI_ITCH_KEY"],
    });

    expect(submittedConfig).toEqual(config);
    expect(submittedOverrides).toEqual([
      {
        alias: "itch-production",
        field: "apiKey",
        value: { kind: "environment", name: "CI_ITCH_KEY" },
      },
    ]);
  });

  test("writes the redacted run result instead of artifact paths containing environment values", async () => {
    sandbox = await createSandbox("workflow-result-output");
    const config = createReleaseConfig({
      id: "workflow-output",
      project: "main",
      name: "Workflow output",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "${{ env.PRIVATE_ARTIFACT_PATH }}" },
      },
    });
    const configRoot = join(sandbox.paths.userData, "config");
    await mkdir(join(configRoot, "workflows"), { recursive: true });
    await writeFile(
      join(configRoot, "projects.json"),
      JSON.stringify({
        version: "4.0.0",
        projects: [{ id: "main", name: "Main", description: "CLI output test" }],
        workflows: [
          {
            id: config.id,
            project: "main",
            lastModified: "2026-01-01T00:00:00.000Z",
            type: "internal-workflow",
            configName: `workflows/${config.id}`,
          },
        ],
      }),
    );
    await writeFile(join(configRoot, "workflows", `${config.id}.json`), JSON.stringify(config));

    const secretPath = "/private/artifacts/client-token";
    const rawArtifact = { name: "published", path: secretPath };
    const safeArtifact = { name: "published", path: "[REDACTED]" };
    const makeResult = (artifact: typeof rawArtifact): WorkflowResult => ({
      status: "completed",
      outputs: {},
      artifacts: [artifact],
      deliveries: [],
      steps: {
        "release-folder-source": {
          id: "release-folder-source",
          uses: "filesystem:copy",
          status: "completed",
          outputs: {},
          artifacts: [artifact],
          startedAt: 0,
          completedAt: 1,
          duration: 1,
        },
      },
    });
    const result = makeResult(rawArtifact);
    const safeResult = makeResult(safeArtifact);
    vi.spyOn(coreNode, "executeWorkflow").mockImplementation(
      async (_context, _configName, options) => {
        options?.onEvent?.({
          type: "step.started",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          timestamp: 1,
        });
        options?.onEvent?.({
          type: "step.completed",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          outputs: {},
          artifacts: [safeArtifact],
          duration: 1,
          timestamp: 2,
        });
        return { result, safeResult, runId: "run-output-test" };
      },
    );

    const outputPath = join(sandbox.path, "workflow-result.json");
    await runWorkflowCommand(config.id, {
      userData: sandbox.paths.userData,
      output: outputPath,
    });

    const output = await readFile(outputPath, "utf8");
    expect(output).not.toContain(secretPath);
    expect(JSON.parse(output)).toEqual({ result: safeResult, runId: "run-output-test" });
  });

  test("forwards run-scoped connection overrides to shared workflow execution", async () => {
    sandbox = await createSandbox("workflow-connection-overrides");
    const config = createReleaseConfig({
      id: "workflow-connections",
      project: "main",
      name: "Workflow connections",
      source: { provider: "@pipelab/core/source/folder", config: { path: "/source" } },
    });
    const configRoot = join(sandbox.paths.userData, "config");
    await mkdir(join(configRoot, "workflows"), { recursive: true });
    await writeFile(
      join(configRoot, "projects.json"),
      JSON.stringify({
        version: "4.0.0",
        projects: [{ id: "main", name: "Main", description: "CLI connection test" }],
        workflows: [
          {
            id: config.id,
            project: "main",
            lastModified: "2026-01-01T00:00:00.000Z",
            type: "internal-workflow",
            configName: `workflows/${config.id}`,
          },
        ],
      }),
    );
    await writeFile(join(configRoot, "workflows", `${config.id}.json`), JSON.stringify(config));

    const connectionOverrides = ["itch-release.apiKey=literal:cli-local-secret"];
    const result: WorkflowResult = {
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {
        "release-folder-source": {
          id: "release-folder-source",
          uses: "filesystem:copy",
          status: "completed",
          outputs: {},
          artifacts: [],
          startedAt: 0,
          completedAt: 1,
          duration: 1,
        },
      },
    };
    let receivedOverrides: unknown;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(coreNode, "executeWorkflow").mockImplementation(
      async (_context, _configName, options) => {
        receivedOverrides = options?.connectionOverrides;
        options?.onEvent?.({
          type: "step.started",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          timestamp: 1,
        });
        options?.onEvent?.({
          type: "step.completed",
          stepId: "release-folder-source",
          uses: "filesystem:copy",
          outputs: {},
          artifacts: [],
          duration: 1,
          timestamp: 2,
        });
        return { result, safeResult: result, runId: "run-connection-test" };
      },
    );

    await runWorkflowCommand(config.id, {
      userData: sandbox.paths.userData,
      connection: connectionOverrides,
    });

    expect(receivedOverrides).toEqual([
      {
        alias: "itch-release",
        field: "apiKey",
        value: { kind: "literal", value: "cli-local-secret" },
      },
    ]);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("shell history"));
    expect(JSON.stringify(warning.mock.calls)).not.toContain("cli-local-secret");
  });
});

describe("workflow CLI task durations", () => {
  test("formats durations in milliseconds and seconds", () => {
    expect(formatWorkflowStepElapsed(742)).toBe("742 ms");
    expect(formatWorkflowStepElapsed(12_345)).toBe("12.35 s");
  });
});

describe("workflow CLI task statuses", () => {
  test("reports a single failed step and failed workflow", async () => {
    const failedStep = Promise.reject(new Error("hook failed"));
    const listr = createWorkflowListr("Release", [step("Hook", () => failedStep)], failedStep);

    await expect(listr.run()).rejects.toThrow("hook failed");

    expect(status(listr, "Hook")).toBe(ListrTaskState.FAILED);
    expect(listr.tasks[0].state).toBe(ListrTaskState.FAILED);
  });

  test("keeps a delayed successful sibling successful when a step fails", async () => {
    const failed = new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("hook failed")), 5),
    );
    const successful = new Promise<void>((resolve) => setTimeout(resolve, 25));
    const execution = Promise.allSettled([failed, successful]).then(() => {
      throw new Error("hook failed");
    });
    const listr = createWorkflowListr(
      "Release",
      [step("Hook", () => failed), step("Other step", () => successful)],
      execution,
    );

    await expect(listr.run()).rejects.toThrow("hook failed");

    expect(status(listr, "Hook")).toBe(ListrTaskState.FAILED);
    expect(status(listr, "Other step")).toBe(ListrTaskState.COMPLETED);
    expect(listr.tasks[0].state).toBe(ListrTaskState.FAILED);
  });

  test("reports successful steps and preserves skipped status", async () => {
    const listr = createWorkflowListr(
      "Release",
      [
        step("Build", async () => undefined),
        step("Blocked delivery", (_context, task) => {
          task.task.state$ = ListrTaskState.SKIPPED;
        }),
      ],
      Promise.resolve(),
    );

    await listr.run();

    expect(status(listr, "Build")).toBe(ListrTaskState.COMPLETED);
    expect(status(listr, "Blocked delivery")).toBe(ListrTaskState.SKIPPED);
    expect(listr.tasks[0].state).toBe(ListrTaskState.COMPLETED);
  });

  test("settles a waiting step when execution rejects before emitting step events", async () => {
    let releaseStep!: () => void;
    const waitingStep = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });
    const execution = Promise.reject(new Error("runtime failed before step events"));
    const listr = createWorkflowListr(
      "Release",
      [
        step("Not started", async (_context, task) => {
          await waitingStep;
          task.task.state$ = ListrTaskState.SKIPPED;
        }),
      ],
      execution,
      undefined,
      () => releaseStep(),
    );

    await expect(listr.run()).rejects.toThrow("runtime failed before step events");

    expect(status(listr, "Not started")).toBe(ListrTaskState.SKIPPED);
    expect(listr.tasks[0].state).toBe(ListrTaskState.FAILED);
  });
});
