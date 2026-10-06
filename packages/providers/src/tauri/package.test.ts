import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWorkflowTask } from "@pipelab/test-utils";
import type { TauriWorkflowTaskServices } from "./package";
import { tauriPackageWorkflowTaskFactory } from "./package";
import { tauri } from "./tauri";

vi.mock("./tauri", () => ({ tauri: vi.fn() }));

const tauriMock = vi.mocked(tauri);
const roots: string[] = [];
const artifacts = {
  output: {
    descriptor: {
      kind: "application" as const,
      technology: "tauri",
      platform: "linux" as const,
      architecture: "x64" as const,
      container: "directory" as const,
    },
  },
};
const services = {
  context: {} as TauriWorkflowTaskServices["context"],
  executables: { node: process.execPath, pnpm: "pnpm" },
  workflowCachePath: "/tmp/pipelab-tauri-cache",
} satisfies TauriWorkflowTaskServices;

const workspace = async () => {
  const path = await mkdtemp(join(tmpdir(), "pipelab-tauri-task-"));
  roots.push(path);
  return path;
};

afterEach(async () => {
  tauriMock.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Tauri native workflow task", () => {
  it("returns package outputs and registers its artifact", async () => {
    const workspacePath = await workspace();
    tauriMock.mockImplementation(async (_action, _appFolder, execution) => {
      execution.log("Tauri package finished");
      return { folder: "/build/tauri", binary: "/build/tauri/app" };
    });

    const result = await runWorkflowTask(tauriPackageWorkflowTaskFactory(services), {
      workspacePath,
      inputs: { "input-folder": "/input", name: "App", platform: "linux", arch: "x64" },
      artifacts,
      services,
    });

    expect(result.outputs).toEqual({ output: "/build/tauri", binary: "/build/tauri/app" });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({ artifact: "output", path: "/build/tauri" });
    expect(result.logs).toContain("Tauri package finished");
  });

  it("reports package errors through workflow-runtime", async () => {
    const workspacePath = await workspace();
    tauriMock.mockRejectedValue(new Error("Tauri package failed"));

    await expect(
      runWorkflowTask(tauriPackageWorkflowTaskFactory(services), {
        workspacePath,
        inputs: { "input-folder": "/input" },
        artifacts,
        services,
      }),
    ).rejects.toThrow("Tauri package failed");
  });

  it("passes cancellation to the package operation", async () => {
    const workspacePath = await workspace();
    tauriMock.mockImplementation(
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
        runWorkflowTask(tauriPackageWorkflowTaskFactory(services), {
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
