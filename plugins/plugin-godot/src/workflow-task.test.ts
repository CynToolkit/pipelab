import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWorkflowTask } from "@pipelab/test-utils";
import { godotExportTask } from "./index";

const roots: string[] = [];
const descriptor = {
  output: {
    descriptor: {
      kind: "application" as const,
      technology: "godot",
      platform: "linux" as const,
      architecture: "x64" as const,
      container: "directory" as const,
    },
  },
};

const sandbox = async () => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-godot-task-"));
  roots.push(root);
  const project = join(root, "project");
  await mkdir(project);
  return { root, project };
};

const mockGodot = async (root: string, body: string) => {
  const executable = join(root, "godot");
  await writeFile(executable, `#!/bin/sh\n${body}\n`);
  await chmod(executable, 0o755);
  return executable;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Godot native workflow task", () => {
  it("returns and registers the exported artifact and streams process logs", async () => {
    const { root, project } = await sandbox();
    const executable = await mockGodot(root, 'echo "export started"; printf game > "$6"');

    const result = await runWorkflowTask(godotExportTask, {
      workspacePath: root,
      artifacts: descriptor,
      inputs: { executable, project, preset: "Linux", target: "linux-x64", projectName: "game" },
    });

    expect(result.result.steps.task.status).toBe("completed");
    expect(result.outputs.output).toBe(join(root, ".pipelab-godot", "linux-x64"));
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({ artifact: "output", size: 4 });
    expect(result.logs.join("\n")).toContain("export started");
    expect(project).toBeDefined();
  });

  it("reports export failures through workflow-runtime", async () => {
    const { root, project } = await sandbox();
    const executable = await mockGodot(root, 'echo "export failed" >&2; exit 7');

    await expect(
      runWorkflowTask(godotExportTask, {
        workspacePath: root,
        artifacts: descriptor,
        inputs: { executable, project, preset: "Linux", target: "linux-x64" },
      }),
    ).rejects.toThrow("exit code 7");
  });

  it("propagates workflow cancellation to the exporter process", async () => {
    const { root, project } = await sandbox();
    const executable = await mockGodot(root, "exec sleep 30");
    const controller = new AbortController();
    const cancellation = setTimeout(() => controller.abort("test cancellation"), 100);

    try {
      await expect(
        runWorkflowTask(godotExportTask, {
          workspacePath: root,
          artifacts: descriptor,
          signal: controller.signal,
          inputs: { executable, project, preset: "Linux", target: "linux-x64" },
        }),
      ).rejects.toThrow("test cancellation");
    } finally {
      clearTimeout(cancellation);
    }
  }, 10_000);
});
