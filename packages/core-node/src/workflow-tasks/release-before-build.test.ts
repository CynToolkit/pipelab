import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RELEASE_BEFORE_BUILD_TASK_ID } from "@pipelab/shared";
import { createLocalHost, type WorkflowTaskContext } from "@pipelab/workflow-runtime";
import { PipelabContext } from "../context";
import type { ProviderServices } from "../workflow-tasks";
import { releaseBeforeBuildWorkflowTask } from "./release-before-build";

const roots: string[] = [];

const sandbox = async () => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-before-build-task-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("release beforeBuild task", () => {
  it.skipIf(process.platform === "win32")(
    "rejects an external data.json symlink before running a command",
    async () => {
      const root = await sandbox();
      const workspaceRoot = join(root, "workspace");
      const artifactRoot = join(root, "artifact");
      const outsideData = join(root, "outside-data.json");
      await mkdir(workspaceRoot, { recursive: true });
      await mkdir(artifactRoot, { recursive: true });
      await writeFile(outsideData, '{"untouched":true}');
      await symlink(outsideData, join(artifactRoot, "data.json"));

      const host = createLocalHost(workspaceRoot);
      const services: ProviderServices = {
        context: new PipelabContext({ userDataPath: join(root, "user-data") }),
        executables: { node: process.execPath, pnpm: join(root, "pnpm.cjs") },
        run: {
          id: "run-id",
          workflowId: "workflow-id",
          projectId: "project-id",
          releaseVersion: "1.0.0",
        },
        workflowCachePath: workspaceRoot,
      };
      const taskContext: WorkflowTaskContext<ProviderServices> = {
        step: { id: "before-build", uses: RELEASE_BEFORE_BUILD_TASK_ID },
        inputs: {
          input: artifactRoot,
          command: "should-not-run",
          profileId: "profile-id",
        },
        outputs: {},
        artifacts: [],
        services,
        workspace: host.workspace,
        filesystem: host.filesystem,
        processes: host.processes,
        logger: host.logger,
        signal: new AbortController().signal,
        log: vi.fn(),
        logStream: vi.fn(),
        setArtifact: vi.fn(),
      };

      await expect(releaseBeforeBuildWorkflowTask(taskContext)).rejects.toThrow(
        "symlink outside its staged copy",
      );
      await expect(readFile(outsideData, "utf8")).resolves.toBe('{"untouched":true}');
    },
  );
});
