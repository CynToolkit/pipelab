import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createLocalHost, runWorkflow, type WorkflowEvent, type WorkflowHost } from "./index";

const makeHost = (): WorkflowHost => ({
  workspace: { root: "/workspace" },
  filesystem: { ensureDirectory: vi.fn(async () => undefined) },
  processes: { execute: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
});

describe("runWorkflow", () => {
  it("runs steps sequentially and resolves variables and previous outputs", async () => {
    const host = makeHost();
    const events: WorkflowEvent[] = [];

    const result = await runWorkflow(
      {
        version: 1,
        steps: [
          { id: "produce", uses: "test:produce", with: { value: "${{ variables.greeting }}" } },
          {
            id: "consume",
            uses: "test:consume",
            with: { value: "${{ steps.produce.outputs.value }}" },
          },
        ],
      },
      {
        host,
        variables: { greeting: "hello" },
        onEvent: (event) => events.push(event),
        tasks: {
          "test:produce": async ({ inputs, log, setArtifact }) => {
            log(`produced ${inputs.value}`);
            setArtifact("output", "/workspace/output.txt");
            return { value: inputs.value };
          },
          "test:consume": async ({ inputs }) => ({ received: inputs.value }),
        },
      },
    );

    expect(result.outputs).toEqual({
      produce: { value: "hello" },
      consume: { received: "hello" },
    });
    expect(result.artifacts).toEqual([{ name: "output", path: "/workspace/output.txt" }]);
    expect(events.map((event) => event.type)).toEqual([
      "workflow.started",
      "step.started",
      "step.log",
      "step.completed",
      "step.started",
      "step.completed",
      "workflow.completed",
    ]);
    expect(host.logger.info).toHaveBeenCalledWith("produced hello");
  });

  it("stops execution and reports structured failure when cancelled", async () => {
    const host = makeHost();
    const controller = new AbortController();
    const events: WorkflowEvent[] = [];
    let secondStepRan = false;

    const promise = runWorkflow(
      {
        version: 1,
        steps: [
          { id: "wait", uses: "test:wait" },
          { id: "never", uses: "test:never" },
        ],
      },
      {
        host,
        signal: controller.signal,
        onEvent: (event) => events.push(event),
        tasks: {
          "test:wait": async ({ signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  const error = new Error("cancelled");
                  error.name = "AbortError";
                  reject(error);
                },
                { once: true },
              );
            }),
          "test:never": async () => {
            secondStepRan = true;
          },
        },
      },
    );

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(secondStepRan).toBe(false);
    expect(events.at(-1)?.type).toBe("workflow.failed");
  });

  it("stops after a failed task and emits step and workflow failure events", async () => {
    const host = makeHost();
    const events: WorkflowEvent[] = [];
    let secondStepRan = false;

    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            { id: "fail", uses: "test:fail" },
            { id: "never", uses: "test:never" },
          ],
        },
        {
          host,
          onEvent: (event) => events.push(event),
          tasks: {
            "test:fail": async () => {
              throw new Error("task failed");
            },
            "test:never": async () => {
              secondStepRan = true;
            },
          },
        },
      ),
    ).rejects.toThrow("task failed");

    expect(secondStepRan).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      "workflow.started",
      "step.started",
      "step.failed",
      "workflow.failed",
    ]);
  });

  it("runs ready dependency branches concurrently", async () => {
    const host = makeHost();
    const started: string[] = [];
    let releaseBranches: (() => void) | undefined;
    const branchesReleased = new Promise<void>((resolve) => {
      releaseBranches = resolve;
    });

    const resultPromise = runWorkflow(
      {
        version: 1,
        steps: [
          { id: "bundle", uses: "test:bundle" },
          { id: "steam", uses: "test:upload", needs: ["bundle"] },
          { id: "itch", uses: "test:upload", needs: ["bundle"] },
        ],
      },
      {
        host,
        tasks: {
          "test:bundle": async () => ({ folder: "/workspace/bundle" }),
          "test:upload": async ({ step }) => {
            started.push(step.id);
            await branchesReleased;
            return { status: "uploaded" };
          },
        },
      },
    );

    while (started.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["steam", "itch"]);
    releaseBranches?.();

    await expect(resultPromise).resolves.toMatchObject({
      outputs: {
        steam: { status: "uploaded" },
        itch: { status: "uploaded" },
      },
    });
  });

  it("continues independent branches and skips dependents after a failure", async () => {
    const events: WorkflowEvent[] = [];
    const result = await runWorkflow(
      {
        version: 1,
        continueOnError: true,
        steps: [
          { id: "fail", uses: "test:fail" },
          { id: "blocked", uses: "test:blocked", needs: ["fail"] },
          { id: "independent", uses: "test:independent", needs: [] },
        ],
      },
      {
        host: makeHost(),
        onEvent: (event) => events.push(event),
        tasks: {
          "test:fail": async () => {
            throw new Error("branch failed");
          },
          "test:blocked": async () => ({ ran: true }),
          "test:independent": async () => ({ ran: true }),
        },
      },
    );

    expect(result.status).toBe("completed-with-errors");
    expect(result.steps.fail.status).toBe("failed");
    expect(result.steps.blocked.status).toBe("skipped");
    expect(result.steps.independent.status).toBe("completed");
    expect(events.some((event) => event.type === "step.skipped")).toBe(true);
  });
});

describe("createLocalHost", () => {
  it("runs the migrated fs:run task from Node without Electron", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "pipelab-workflow-"));

    try {
      const result = await runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "command",
              uses: "fs:run",
              with: {
                command: process.execPath,
                parameters: ["-e", "process.stdout.write('hello'); process.stderr.write('warn')"],
                stopOnError: true,
              },
            },
          ],
        },
        { host: createLocalHost(workspace) },
      );

      expect(result.outputs.command).toMatchObject({
        stdout: "hello",
        stderr: "warn",
        exitCode: 0,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
