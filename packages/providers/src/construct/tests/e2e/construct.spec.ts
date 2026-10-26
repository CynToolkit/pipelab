import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
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
  context: { getThirdPartyPath: () => join(tmpdir(), "pipelab-thirdparty") },
  executables: { node: process.execPath, pnpm: "pnpm" },
  run: { projectId: "construct-test-project" },
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

  it("passes the bound Construct Account values to its provider and redacts them from logs", async () => {
    const { root, file } = await makeSandbox();
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    exportMock.mockImplementation(async (_file, execution) => {
      execution.log("Construct login inputs", execution.inputs.username, execution.inputs.password);
      return {
        folder: "/output/project.zip",
        parentFolder: "/output",
        zipFile: "/output/project.zip",
      };
    });

    const result = await runWorkflowTask(constructExportWorkflowTaskFactory(taskServices), {
      workspacePath: root,
      inputs: { file, accountConnectionId: "construct-production" },
      connectionValues: {
        "construct-production": { username, password },
      },
      artifacts: artifactDefinitions,
      services: taskServices,
    });
    const execution = exportMock.mock.calls[0]?.[1];

    expect(execution?.inputs).toMatchObject({ username, password });
    expect(result.logs.join(" ")).not.toContain(username);
    expect(result.logs.join(" ")).not.toContain(password);
  });

  it("preserves bound account credentials when using the version saved in the project archive", async () => {
    const { root, file } = await makeSandbox();
    const archive = new AdmZip();
    archive.addFile("project.c3proj", Buffer.from(JSON.stringify({ savedWithRelease: 43202 })));
    archive.writeZip(file);
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    exportMock.mockResolvedValue({
      folder: "/output/project.zip",
      parentFolder: "/output",
      zipFile: "/output/project.zip",
    });

    await runWorkflowTask(constructExportWorkflowTaskFactory(taskServices), {
      workspacePath: root,
      inputs: { file, accountConnectionId: "construct-production" },
      connectionValues: {
        "construct-production": { username, password },
      },
      artifacts: artifactDefinitions,
      services: taskServices,
    });

    expect(exportMock.mock.calls[0]?.[1].inputs).toMatchObject({
      username,
      password,
      version: "r432-2",
    });
  });

  it("stops an aliased Construct export before calling the exporter when credentials are missing", async () => {
    const { root, file } = await makeSandbox();
    exportMock.mockResolvedValue({
      folder: "/output/project.zip",
      parentFolder: "/output",
      zipFile: "/output/project.zip",
    });

    await expect(
      runWorkflowTask(constructExportWorkflowTaskFactory(taskServices), {
        workspacePath: root,
        inputs: { file, accountConnectionId: "construct-production" },
        artifacts: artifactDefinitions,
        services: taskServices,
      }),
    ).rejects.toThrow(
      "Construct account Connection 'construct-production' is missing required credentials.",
    );
    expect(exportMock).not.toHaveBeenCalled();
  });

  it("logs setup time when Construct reaches Next", async () => {
    const { root, file } = await makeSandbox();
    exportMock.mockImplementation(async (_file, execution) => {
      execution.log('"Next" clicked');
      return {
        folder: "/output/project.zip",
        parentFolder: "/output",
        zipFile: "/output/project.zip",
      };
    });

    const result = await runWorkflowTask(constructExportWorkflowTaskFactory(taskServices), {
      workspacePath: root,
      inputs: { file },
      artifacts: artifactDefinitions,
      services: taskServices,
    });
    const durationIndex = result.logs.findIndex((log) =>
      log.startsWith("Construct setup elapsed "),
    );
    const nextIndex = result.logs.indexOf('"Next" clicked');

    expect(durationIndex).toBeGreaterThanOrEqual(0);
    expect(result.logs[durationIndex]).toMatch(/^Construct setup elapsed \d+ ms$/);
    expect(durationIndex).toBeLessThan(nextIndex);
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
