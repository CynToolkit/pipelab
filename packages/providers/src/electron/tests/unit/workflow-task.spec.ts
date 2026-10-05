import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWorkflowTask } from "@pipelab/test-utils";
import type { ElectronWorkflowTaskServices } from "../../package-v2";
import { electronPackageWorkflowTaskFactory } from "../../package-v2";
import { forge } from "../../forge";

vi.mock("../../forge", () => ({ forge: vi.fn() }));

const forgeMock = vi.mocked(forge);
const roots: string[] = [];
const artifacts = {
  "electron-build": {
    descriptor: {
      kind: "application" as const,
      technology: "electron",
      platform: "linux" as const,
      architecture: "x64" as const,
      container: "directory" as const,
    },
  },
};
const services = {
  context: {} as ElectronWorkflowTaskServices["context"],
  executables: { node: process.execPath, pnpm: "pnpm" },
  workflowCachePath: "/tmp/pipelab-electron-cache",
} satisfies ElectronWorkflowTaskServices;

const workspace = async () => {
  const path = await mkdtemp(join(tmpdir(), "pipelab-electron-task-"));
  roots.push(path);
  return path;
};

afterEach(async () => {
  forgeMock.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Electron native workflow task", () => {
  it("returns the package output and registers its artifact", async () => {
    const workspacePath = await workspace();
    forgeMock.mockImplementation(async (_action, _appFolder, execution) => {
      execution.log("Electron package finished");
      execution.setArtifact("electron-build", "/build/electron");
      return { folder: "/build/electron", binary: "/build/electron/app" };
    });

    const result = await runWorkflowTask(electronPackageWorkflowTaskFactory(services), {
      workspacePath,
      inputs: { "input-folder": "/input", name: "App", platform: "linux", arch: "x64" },
      artifacts,
      services,
    });

    expect(result.outputs).toEqual({ output: "/build/electron" });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      artifact: "electron-build",
      path: "/build/electron",
    });
    expect(result.logs).toContain("Electron package finished");
  });

  it("reports package errors through workflow-runtime", async () => {
    const workspacePath = await workspace();
    forgeMock.mockRejectedValue(new Error("Electron package failed"));

    await expect(
      runWorkflowTask(electronPackageWorkflowTaskFactory(services), {
        workspacePath,
        inputs: { "input-folder": "/input" },
        artifacts,
        services,
      }),
    ).rejects.toThrow("Electron package failed");
  });

  it("passes cancellation to the package operation", async () => {
    const workspacePath = await workspace();
    forgeMock.mockImplementation(
      (_action, _appFolder, execution) =>
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
        runWorkflowTask(electronPackageWorkflowTaskFactory(services), {
          workspacePath,
          inputs: { "input-folder": "/input" },
          artifacts,
          signal: controller.signal,
          services,
        }),
      ).rejects.toThrow("test cancellation");
    } finally {
      clearTimeout(cancellation);
    }
  });
});
