import { describe, expect, test } from "vitest";
import { ListrTaskState, type ListrTask } from "listr2";
import { createWorkflowListr, formatWorkflowStepElapsed } from "../../../src/commands/workflows";

const status = (listr: ReturnType<typeof createWorkflowListr>, title: string) => {
  const root = listr.tasks[0];
  const stepsGroup = root.subtasks[0];
  return stepsGroup.subtasks.find((task) => task.title === title)?.state;
};

const step = (title: string, task: ListrTask["task"]): ListrTask => ({ title, task });

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
