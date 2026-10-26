import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalHost, runWorkflow, type Workflow } from "@pipelab/workflow-runtime";
import type { ProviderServices } from "./workflow-tasks";
import { PipelabContext } from "./context";
import { createCloudArtifactUploadMetadata, createPipelabCloudUploadTask } from "./pipelab-cloud";

const cloudAuth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
}));

vi.mock("./pipelab-cloud-auth", () => ({
  createPipelabCloudAuthClient: () => ({ auth: cloudAuth }),
}));

let workspace: string | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (workspace) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe("createCloudArtifactUploadMetadata", () => {
  it("sends the artifact slot as the Cloud worker output ID", () => {
    const metadata = createCloudArtifactUploadMetadata(
      {
        id: "artifact-build-1-0",
        artifact: "electron.windows",
        version: "1.4.0",
        originalName: "release-build",
        artifactKind: "directory",
      },
      {
        projectId: "project-1",
        buildProfileId: "profile-1",
        buildTargetId: "windows-x64",
      },
      42,
      "a".repeat(64),
    );

    expect(metadata).toEqual({
      artifactId: "artifact-build-1-0",
      artifactOutputId: "electron.windows",
      version: "1.4.0",
      originalName: "release-build",
      artifactKind: "directory",
      projectId: "project-1",
      buildProfileId: "profile-1",
      buildTargetId: "windows-x64",
      size: 42,
      checksum: "a".repeat(64),
    });
  });
});

describe("Pipelab Cloud upload authentication", () => {
  it("fails before making a Worker or storage request when the local session is expired", async () => {
    const testWorkspace = await mkdtemp(join(tmpdir(), "pipelab-cloud-expired-session-"));
    workspace = testWorkspace;
    cloudAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const services: ProviderServices = {
      context: new PipelabContext({ userDataPath: testWorkspace }),
      executables: { node: process.execPath, pnpm: process.execPath },
      run: {
        id: "run-1",
        workflowId: "workflow-1",
        projectId: "project-1",
        releaseVersion: "1.0.0",
      },
      workflowCachePath: testWorkspace,
    };
    const workflow: Workflow = {
      version: 1,
      continueOnError: true,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: {
            output: { descriptor: { kind: "application", container: "file" } },
          },
        },
        {
          id: "cloud-upload",
          uses: "pipelab-cloud:upload",
          needs: ["build"],
          artifactInputs: { input: { stepId: "build", artifact: "output" } },
          with: { buildProfileId: "profile-1", buildTargetId: "windows-x64" },
          delivery: {
            destinationId: "cloud",
            slotId: "windows-x64",
            artifact: { stepId: "build", artifact: "output" },
          },
        },
      ],
    };
    const result = await runWorkflow(workflow, {
      host: createLocalHost(testWorkspace),
      version: "1.0.0",
      services,
      tasks: {
        "test:build": async ({ setArtifact }) => {
          setArtifact("output", join(testWorkspace, "artifact.bin"));
          return {};
        },
        "pipelab-cloud:upload": createPipelabCloudUploadTask(services),
      },
    });

    expect(cloudAuth.getSession).toHaveBeenCalledOnce();
    expect(result.steps["cloud-upload"]?.error?.message).toBe(
      "Sign in to your Pipelab account to upload artifacts to Pipelab Cloud",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
