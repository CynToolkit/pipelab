import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWorkflowTask } from "@pipelab/test-utils";
import type { ConstructWorkflowTaskServices } from "../../export-c3p";
import { constructExportWorkflowTaskFactory } from "../../export-c3p";
import { exportc3p } from "../../export-shared.js";

vi.mock("../../export-shared.js", () => ({ exportc3p: vi.fn() }));

const exportMock = vi.mocked(exportc3p);
const roots: string[] = [];
const artifactDefinitions = {
  zipFile: {
    descriptor: {
      kind: "files" as const,
      technology: "construct",
      container: "archive" as const,
      format: "zip" as const,
    },
  },
};

const makeSandbox = async () => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-construct-task-"));
  roots.push(root);
  const file = join(root, "project.c3p");
  await writeFile(file, "fixture");
  return { root, file };
};

const taskServices = {
  context: { getThirdPartyPath: () => "/tmp/pipelab-thirdparty" },
  executables: { node: process.execPath, pnpm: "pnpm" },
} as unknown as ConstructWorkflowTaskServices;

afterEach(async () => {
  exportMock.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Construct native workflow task", () => {
  it("returns its outputs and registers the declared artifact", async () => {
    const { root, file } = await makeSandbox();
    exportMock.mockImplementation(async (_file, execution) => {
      execution.log("Construct export complete");
      return {
        folder: "/output/project.zip",
        parentFolder: "/output",
        zipFile: "/output/project.zip",
      };
    });

    const task = constructExportWorkflowTaskFactory(taskServices);
    const result = await runWorkflowTask(task, {
      workspacePath: root,
      inputs: { file, version: "stable" },
      artifacts: artifactDefinitions,
      services: taskServices,
    });

    expect(result.outputs).toEqual({
      folder: "/output/project.zip",
      parentFolder: "/output",
      zipFile: "/output/project.zip",
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({ artifact: "zipFile", path: "/output/project.zip" });
    expect(result.logs).toContain("Construct export complete");
  });

  it("surfaces export failures through workflow-runtime", async () => {
    const { root, file } = await makeSandbox();
    exportMock.mockRejectedValue(new Error("Construct export failed"));

    await expect(
      runWorkflowTask(constructExportWorkflowTaskFactory(taskServices), {
        workspacePath: root,
        inputs: { file },
        artifacts: artifactDefinitions,
        services: taskServices,
      }),
    ).rejects.toThrow("Construct export failed");
  });

  it("propagates workflow cancellation to the export operation", async () => {
    const { root, file } = await makeSandbox();
    exportMock.mockImplementation(
      (_file, execution) =>
        new Promise((_resolve, reject) => {
          execution.abortSignal.addEventListener("abort", () => reject(new Error("cancelled")), {
            once: true,
          });
        }),
    );
    const controller = new AbortController();
    const cancellation = setTimeout(() => controller.abort("test cancellation"), 50);

    try {
      await expect(
        runWorkflowTask(constructExportWorkflowTaskFactory(taskServices), {
          workspacePath: root,
          inputs: { file },
          artifacts: artifactDefinitions,
          signal: controller.signal,
          services: taskServices,
        }),
      ).rejects.toThrow("test cancellation");
    } finally {
      clearTimeout(cancellation);
    }
  });
});
