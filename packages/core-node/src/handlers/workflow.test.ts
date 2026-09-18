import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyWorkflowHistoryEvent, createWorkflowDefinition, createWorkflowExecutionPlan, workflowHistoryUpdateFromResult } from "./workflow";
import type { ExecutionStep, LogEntry } from "@pipelab/shared";
import type { Workflow } from "@pipelab/workflow-runtime";
import type { WorkflowConfigV2 } from "@pipelab/shared";
import { WorkflowRunCancellationRegistry } from "./workflow-run-cancellation";

describe("createWorkflowDefinition", () => {
  it("builds parallel web and itch branches from a built folder", async () => {
    const workspace = await mkdtemp(join(process.cwd(), ".workflow-test-"));
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ user: { username: "resolved-user" } }), { status: 200 })),
      );
      const source = join(workspace, "build");
      await mkdir(source);
      const { workflow, variables } = await createWorkflowDefinition(
        {
          version: "1.0.0",
          id: "workflow",
          project: "project",
          name: "Publish",
          source: { type: "folder", path: source },
          destinations: [
            { type: "web", outputDir: join(workspace, "web"), overwrite: true, cleanup: false },
            {
              type: "itch",
              accountConnectionId: "itch-account",
              project: "game",
              channel: "web",
            },
          ],
        },
        new Map([
          [
            "itch-account",
            {
              pluginName: "@pipelab/plugin-itch",
              integrationName: "Itch Butler Account",
              apiKey: "secret",
            },
          ],
          [
            "other-itch-account",
            {
              pluginName: "@pipelab/plugin-itch",
              integrationName: "Itch Butler Account",
              apiKey: "other-secret",
              isDefault: true,
            },
          ],
        ]),
      );

      expect(variables).toMatchObject({ sourcePath: source });
      expect(workflow.continueOnError).toBe(true);
      expect(workflow.steps.map((step) => step.id)).toEqual(["web", "itch"]);
      expect(workflow.steps.map((step) => step.needs)).toEqual([[], []]);
      expect(workflow.steps[1].with).toMatchObject({
        user: "resolved-user",
        "api-key": "${{ variables.itchApiKey }}",
      });
      expect(variables).toMatchObject({ itchApiKey: "secret" });
    } finally {
      vi.unstubAllGlobals();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses release metadata once for Steam packaging and upload", async () => {
    const workspace = await mkdtemp(join(process.cwd(), ".workflow-test-"));
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ user: { username: "resolved-user" } }), { status: 200 })),
      );
      const source = join(workspace, "build");
      await mkdir(source);
      await writeFile(join(source, "icon.png"), "icon");
      const { workflow, variables } = await createWorkflowDefinition(
        {
          version: "1.0.0",
          id: "workflow",
          project: "project",
          name: "My Game",
          source: { type: "folder", path: source },
          destinations: [
            {
              type: "steam",
              accountConnectionId: "steam-account",
              appId: "123",
              depotId: "456",
            },
          ],
        },
        new Map([
          ["steam-account", { username: "player", password: "secret" }],
        ]),
        undefined,
        { version: "2.3.4", description: "Release candidate" },
      );

      expect(workflow.steps[0].with).toMatchObject({
        name: "My Game",
        appBundleId: "com.pipelab.my.game",
        appVersion: "2.3.4",
        description: "Release candidate",
        icon: join(source, "icon.png"),
      });
      expect(workflow.steps[1].with).toMatchObject({
        appId: "123",
        depotId: "456",
        description: "Release candidate",
      });
      expect(variables).toMatchObject({ steamUsername: "player", steamPassword: "secret" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not schedule inactive destinations", async () => {
    const workspace = await mkdtemp(join(process.cwd(), ".workflow-test-"));
    try {
      const source = join(workspace, "build");
      await mkdir(source);
      const { workflow } = await createWorkflowDefinition(
        {
          version: "1.0.0",
          id: "workflow",
          project: "project",
          name: "Publish",
          source: { type: "folder", path: source },
          destinations: [
            { type: "web", enabled: false, outputDir: join(workspace, "web"), overwrite: false, cleanup: false },
            {
              type: "itch",
              enabled: true,
              accountConnectionId: "itch-account",
              project: "game",
              channel: "web",
            },
          ],
        },
        new Map([
          [
            "itch-account",
            { pluginName: "@pipelab/plugin-itch", integrationName: "Itch Butler Account", apiKey: "secret" },
          ],
        ]),
      );

      expect(workflow.steps.map((step) => step.id)).toEqual(["itch"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("workflow Build History updates", () => {
  it("persists the complete compiled execution plan as pending with readable metadata", () => {
    const config: WorkflowConfigV2 = {
      version: "2.0.0", id: "flow-1", project: "project-1", name: "Release",
      source: { type: "construct3", path: "/game.c3p" },
      packagers: [{ id: "electron-1", definitionId: "electron", name: "Electron", enabled: true, config: { targets: ["electron.windows"] } }],
      destinations: [{ id: "steam-instance", serviceId: "steam", enabled: true, config: {}, slots: [{ id: "windows", config: {}, input: { packagerId: "electron-1", outputId: "electron.windows" } }] }],
    };
    const workflow: Workflow = {
      version: 1,
      steps: [
        { id: "source-export", uses: "construct:export" },
        { id: "packager-electron-windows", uses: "electron:bundle", with: { packagerId: "electron-1", outputId: "electron.windows" } },
        { id: "delivery-steam-instance-windows", uses: "steam:upload", delivery: { destinationId: "steam-instance", slotId: "windows", artifactOutputId: "electron.windows" } },
      ],
    };

    const plan = createWorkflowExecutionPlan(workflow, config, 100);

    expect(plan.map(({ id, name, status }) => ({ id, name, status }))).toEqual([
      { id: "source-export", name: "Export Construct project", status: "pending" },
      { id: "packager-electron-windows", name: "Electron · Windows x64", status: "pending" },
      { id: "delivery-steam-instance-windows", name: "Steam · Windows x64", status: "pending" },
    ]);
    expect(plan[2]).toMatchObject({ destinationId: "steam-instance", serviceId: "steam", destinationName: "Steam", outputId: "electron.windows" });
  });

  it("updates a pending step in place while preserving its user-facing metadata", () => {
    const steps: Record<string, ExecutionStep> = {
      package: { id: "package", name: "Electron · Windows x64", status: "pending", startTime: 100, logs: [], uses: "electron:bundle", outputId: "electron.windows" },
    };
    const logs: LogEntry[] = [];

    applyWorkflowHistoryEvent({ type: "step.started", stepId: "package", uses: "electron:bundle", timestamp: 120 }, steps, logs);
    applyWorkflowHistoryEvent({ type: "step.completed", stepId: "package", uses: "electron:bundle", outputs: {}, artifacts: [], duration: 10, timestamp: 130 }, steps, logs);

    expect(Object.keys(steps)).toEqual(["package"]);
    expect(steps.package).toMatchObject({ name: "Electron · Windows x64", status: "completed", outputId: "electron.windows", startTime: 120, endTime: 130 });
  });

  it("persists live step status, outputs, timestamps and scoped logs", () => {
    const steps: Record<string, ExecutionStep> = {};
    const logs: LogEntry[] = [];
    applyWorkflowHistoryEvent({ type: "step.started", stepId: "package", uses: "packager:build", timestamp: 100 }, steps, logs);
    applyWorkflowHistoryEvent({ type: "step.log", stepId: "package", stream: "stdout", message: "created archive", timestamp: 110 }, steps, logs);
    applyWorkflowHistoryEvent({ type: "step.completed", stepId: "package", uses: "packager:build", outputs: { file: "/tmp/game.zip" }, artifacts: [], duration: 25, timestamp: 125 }, steps, logs);

    expect(steps.package).toMatchObject({ status: "completed", startTime: 100, endTime: 125, duration: 25, output: { file: "/tmp/game.zip" } });
    expect(steps.package.logs).toEqual(logs);
    expect(logs[0]).toMatchObject({ source: "package", message: "created archive", timestamp: 110 });
  });

  it("records failed and skipped steps for terminal run detail", () => {
    const steps: Record<string, ExecutionStep> = {};
    const logs: LogEntry[] = [];
    applyWorkflowHistoryEvent({ type: "step.failed", stepId: "publish", uses: "steam:upload", error: { name: "Error", message: "upload rejected" }, duration: 9, timestamp: 209 }, steps, logs);
    applyWorkflowHistoryEvent({ type: "step.skipped", stepId: "notify", uses: "notify:release", blockedBy: ["publish"], timestamp: 210 }, steps, logs);

    expect(steps.publish).toMatchObject({ status: "failed", endTime: 209, error: { message: "upload rejected", timestamp: 209 } });
    expect(steps.notify).toMatchObject({ status: "skipped", endTime: 210 });
  });
});

describe("workflow run cancellation", () => {
  it("cancels only the requested active run", () => {
    const runs = new WorkflowRunCancellationRegistry();
    const first = new AbortController();
    const second = new AbortController();
    runs.register("run-1", first);
    runs.register("run-2", second);

    expect(runs.cancel("run-1")).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(runs.cancel("missing-run")).toBe(false);
  });
});

describe("workflow history results", () => {
  it("preserves the run version, artifact instances, and independent deliveries", () => {
    const update = workflowHistoryUpdateFromResult({
      version: "1.4.0",
      status: "completed-with-errors",
      outputs: {},
      artifacts: [{
        id: "artifact-run-0",
        outputId: "electron.windows",
        version: "1.4.0",
        platform: "windows",
        architecture: "x64",
        format: "zip",
        path: "/artifacts/game.zip",
        producerStep: "packager-windows",
        size: 184000000,
      }],
      deliveries: [{
        id: "delivery-steam-windows",
        destinationId: "steam-instance",
        serviceId: "steam",
        destinationName: "Steam",
        slotId: "windows",
        artifactId: "artifact-run-0",
        status: "completed",
        startedAt: 10,
        completedAt: 20,
        duration: 10,
      }, {
        id: "delivery-itch-windows",
        destinationId: "itch-instance",
        serviceId: "itch",
        destinationName: "Itch.io",
        slotId: "windows",
        artifactId: "artifact-run-0",
        status: "failed",
        startedAt: 20,
        completedAt: 30,
        duration: 10,
        error: "Itch rejected the upload",
      }],
      steps: {},
    });

    expect(update).toEqual(expect.objectContaining({
      status: "completed-with-errors",
      version: "1.4.0",
      artifacts: expect.any(Array),
      deliveries: expect.any(Array),
    }));
    expect(update.artifacts?.[0]).toMatchObject({ outputId: "electron.windows", producerStep: "packager-windows" });
    expect(update.deliveries?.[0]).toMatchObject({ destinationId: "steam-instance", serviceId: "steam", destinationName: "Steam" });
    expect(update.deliveries?.[1]).toMatchObject({ destinationId: "itch-instance", serviceId: "itch", destinationName: "Itch.io", error: "Itch rejected the upload" });
  });
});
