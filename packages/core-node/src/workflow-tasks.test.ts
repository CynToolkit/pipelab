import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { WorkflowTaskContext } from "@pipelab/workflow-runtime";
import { PipelabContext } from "./context";
import type { ActionRunner } from "./types/runner";
import { createPipelabWorkflowTasks, createWorkflowActionTask } from "./workflow-tasks";

const makeTaskContext = (): WorkflowTaskContext => ({
  step: { id: "test", uses: "test:action" },
  inputs: { source: "/tmp/source" },
  workspace: { root: "/tmp/workflow" },
  filesystem: { ensureDirectory: vi.fn(async () => undefined) },
  processes: { execute: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  signal: new AbortController().signal,
  log: vi.fn(),
  logStream: vi.fn(),
  setArtifact: vi.fn(),
});

describe("createWorkflowActionTask", () => {
  it("runs a Godot export, streams output and records a checksummed artifact", async () => {
    const project = await mkdtemp(join(tmpdir(), "pipelab-godot-test-"));
    const root = join(project, "workflow");
    try {
      const processExecute = vi.fn(async (command: string, args: string[], options: { onStdout?: (chunk: string) => void }) => {
        expect(command).toBe("godot4");
        expect(args).toEqual(["--headless", "--path", project, "--export-release", "Windows Desktop", join(root, ".pipelab-godot", "godot", "godot.windows", "My-Game.exe")]);
        await mkdir(join(root, ".pipelab-godot", "godot", "godot.windows"), { recursive: true });
        await writeFile(args.at(-1)!, "exported binary");
        options.onStdout?.("export complete");
        return { exitCode: 0, stdout: "export complete", stderr: "", duration: 10 };
      });
      const taskContext = {
        ...makeTaskContext(),
        step: { id: "godot-export", uses: "godot:export", with: { outputId: "godot.windows" } },
        inputs: { project, preset: "Windows Desktop", outputId: "godot.windows", packagerId: "godot", godotExecutable: "godot4", platform: "windows", projectName: "My Game" },
        workspace: { root },
        filesystem: { ensureDirectory: async (path: string) => mkdir(path, { recursive: true }).then(() => undefined) },
        processes: { execute: processExecute as any },
      };
      const tasks = createPipelabWorkflowTasks(
        { context: new PipelabContext({ userDataPath: "/tmp/pipelab-user-data" }), paths: { cache: "/tmp/cache", pnpm: "/tmp/pnpm", node: "/tmp/node", userData: "/tmp/pipelab-user-data", modules: "", thirdparty: "/tmp/thirdparty" } },
        [
          { id: "@pipelab/plugin-construct", nodes: ["export-construct-project", "export-construct-project-folder"].map((id) => ({ node: { id }, runner: async () => undefined })) },
          { id: "@pipelab/plugin-filesystem", nodes: ["unzip-file-node", "fs:copy"].map((id) => ({ node: { id }, runner: async () => undefined })) },
          { id: "@pipelab/plugin-electron", nodes: [{ node: { id: "electron:package:v2" }, runner: async () => undefined }] },
          { id: "@pipelab/plugin-steam", nodes: [{ node: { id: "steam-upload" }, runner: async () => undefined }] },
          { id: "@pipelab/plugin-itch", nodes: [{ node: { id: "itch-upload" }, runner: async () => undefined }] },
        ] as any,
      );
      await tasks["godot:export"](taskContext as any);
      expect(taskContext.logStream).toHaveBeenCalledWith("stdout", "export complete");
      expect(taskContext.setArtifact).toHaveBeenCalledWith("godot.windows", join(root, ".pipelab-godot", "godot", "godot.windows"), expect.objectContaining({ size: 15, checksum: expect.any(String) }));
      expect(await readFile(join(root, ".pipelab-godot", "godot", "godot.windows", "My-Game.exe"), "utf8")).toBe("exported binary");
    } finally { await rm(project, { recursive: true, force: true }); }
  });

  it("adapts action outputs, logs, artifacts, and cancellation", async () => {
    const actionRunner: ActionRunner<any> = async (options) => {
      options.log("export started");
      options.setOutput("zipFile", "/tmp/workflow/export");
      options.setArtifact("export", "/tmp/workflow/export");
      expect(options.abortSignal.aborted).toBe(false);
      expect(options.inputs).toEqual({ source: "/tmp/source" });
    };
    const taskContext = makeTaskContext();
    const task = createWorkflowActionTask(actionRunner, {
      context: new PipelabContext({ userDataPath: "/tmp/pipelab-user-data" }),
      paths: {
        cache: "/tmp/cache",
        pnpm: "/tmp/pnpm",
        node: "/tmp/node",
        userData: "/tmp/pipelab-user-data",
        modules: "",
        thirdparty: "/tmp/thirdparty",
      },
      outputAliases: { outputDirectory: "zipFile" },
    });

    await expect(task(taskContext)).resolves.toEqual({
      zipFile: "/tmp/workflow/export",
      outputDirectory: "/tmp/workflow/export",
    });
    expect(taskContext.log).toHaveBeenCalledWith("export started");
    expect(taskContext.setArtifact).toHaveBeenCalledWith("export", "/tmp/workflow/export");
  });

  it("maps legacy packager artifact names to the stable workflow output", async () => {
    const actionRunner: ActionRunner<any> = async ({ setArtifact }) => {
      setArtifact("electron-build", "/tmp/workflow/game");
    };
    const taskContext = {
      ...makeTaskContext(),
      step: { id: "packager", uses: "electron:bundle", with: { outputId: "electron.windows" } },
    };

    await createWorkflowActionTask(actionRunner, {
      context: new PipelabContext({ userDataPath: "/tmp/pipelab-user-data" }),
      paths: {
        cache: "/tmp/cache",
        pnpm: "/tmp/pnpm",
        node: "/tmp/node",
        userData: "/tmp/pipelab-user-data",
        modules: "",
        thirdparty: "/tmp/thirdparty",
      },
    })(taskContext);

    expect(taskContext.setArtifact).toHaveBeenCalledWith("electron.windows", "/tmp/workflow/game");
  });

  it("registers the real workflow task IDs without the graph engine", async () => {
    const runner = async () => undefined;
    const plugin = (id: string, nodeIds: string[]) => ({
      id,
      nodes: nodeIds.map((nodeId) => ({ node: { id: nodeId }, runner })),
    });
    const tasks = createPipelabWorkflowTasks(
      {
        context: new PipelabContext({ userDataPath: "/tmp/pipelab-user-data" }),
        paths: {
          cache: "/tmp/cache",
          pnpm: "/tmp/pnpm",
          node: "/tmp/node",
          userData: "/tmp/pipelab-user-data",
          modules: "",
          thirdparty: "/tmp/thirdparty",
        },
      },
      [
        plugin("@pipelab/plugin-construct", [
          "export-construct-project",
          "export-construct-project-folder",
        ]),
        plugin("@pipelab/plugin-filesystem", ["unzip-file-node", "fs:copy"]),
        plugin("@pipelab/plugin-electron", ["electron:package:v2"]),
        plugin("@pipelab/plugin-steam", ["steam-upload"]),
        plugin("@pipelab/plugin-itch", ["itch-upload"]),
        plugin("@pipelab/plugin-poki", ["poki-upload"]),
      ],
    );

    expect(Object.keys(tasks)).toEqual([
      "godot:export",
      "construct:export",
      "construct:export-folder",
      "source:extract",
      "filesystem:copy",
      "electron:bundle",
      "web:bundle",
      "filesystem:zip",
      "steam:upload",
      "itch:upload",
      "poki:upload",
      "pipelab-cloud:upload",
    ]);
  });
});
