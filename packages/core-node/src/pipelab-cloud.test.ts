import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PipelabContext } from "./context";

const { mockSupabase, mockInvoke } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockSupabase = vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "user-access-token", user: { is_anonymous: false } } },
        error: null,
      })),
    },
    functions: { invoke: mockInvoke },
  }));
  return { mockSupabase, mockInvoke };
});

vi.mock("@pipelab/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pipelab/shared")>()),
  supabase: mockSupabase,
}));

import { createPipelabCloudUploadTask } from "./pipelab-cloud";

describe("Pipelab Cloud artifact upload task", () => {
  const previousWorkerUrl = process.env.PIPELAB_CLOUD_WORKER_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    mockInvoke.mockReset();
    if (previousWorkerUrl === undefined) delete process.env.PIPELAB_CLOUD_WORKER_URL;
    else process.env.PIPELAB_CLOUD_WORKER_URL = previousWorkerUrl;
  });

  it("uploads a file and finalizes its checksum, version, and artifact identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-cloud-test-"));
    const source = join(root, "game.zip");
    await writeFile(source, "game artifact");
    process.env.PIPELAB_CLOUD_WORKER_URL = "http://127.0.0.1:8788";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://127.0.0.1:8788/") {
        const body = JSON.parse(String(init?.body));
        const result =
          body.action === "prepareUpload"
            ? {
                uploadUrl:
                  "http://127.0.0.1:8787/pipelab-cloud-local/user/electron.windows/file.zip",
                storageKey: "user/electron.windows/file.zip",
                headers: { "content-type": "application/zip" },
              }
            : {
                artifact: {
                  id: "00000000-0000-4000-8000-000000000123",
                  uploaded_at: "2026-09-16T00:00:00Z",
                },
              };
        return Response.json(result);
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const outputs = await createPipelabCloudUploadTask(
        new PipelabContext({ userDataPath: root }),
      )({
        step: { id: "cloud", uses: "pipelab-cloud:upload" },
        inputs: {},
        delivery: {
          destinationId: "pipelab-cloud-bzohqr1g",
          slotId: "windows",
          artifact: {
            id: "artifact-build-1-0",
            outputId: "electron.windows",
            version: "1.4.0",
            platform: "windows",
            architecture: "x64",
            format: "zip",
            path: source,
            producerStep: "packager-electron-windows",
          },
        },
        workspace: { root },
        filesystem: { ensureDirectory: async () => undefined },
        processes: { execute: vi.fn() },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        signal: new AbortController().signal,
        log: vi.fn(),
        logStream: vi.fn(),
        setArtifact: vi.fn(),
      });

      const apiCalls = fetchMock.mock.calls.filter(
        ([url]) => String(url) === "http://127.0.0.1:8788/",
      );
      const prepareBody = JSON.parse(String(apiCalls[0][1]?.body));
      expect(prepareBody).toMatchObject({
        action: "prepareUpload",
        artifactId: "artifact-build-1-0",
        artifactOutputId: "electron.windows",
        version: "1.4.0",
        size: 13,
        checksum: "6bcef858a9f1335901d8923409b4f1098585fa62cc944b5ce31832ecbf67696a",
      });
      expect(JSON.parse(String(apiCalls[1][1]?.body))).toMatchObject({
        action: "completeUpload",
        artifactId: "artifact-build-1-0",
        artifactOutputId: "electron.windows",
        version: "1.4.0",
        storageKey: "user/electron.windows/file.zip",
      });
      expect(apiCalls[0][1]?.headers).toMatchObject({
        authorization: "Bearer user-access-token",
        "content-type": "application/json",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8787/pipelab-cloud-local/user/electron.windows/file.zip",
        expect.objectContaining({
          method: "PUT",
          duplex: "half",
          headers: { "content-type": "application/zip", "content-length": "13" },
        }),
      );
      expect(outputs).toMatchObject({
        cloud: {
          hostedArtifactId: "00000000-0000-4000-8000-000000000123",
          uploadedAt: "2026-09-16T00:00:00Z",
        },
        artifactOutputId: "electron.windows",
        size: 13,
      });
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when cloud completion omits the hosted artifact ID", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-cloud-missing-id-"));
    const source = join(root, "game.zip");
    await writeFile(source, "game artifact");
    process.env.PIPELAB_CLOUD_WORKER_URL = "http://127.0.0.1:8788";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://127.0.0.1:8788/") {
        const body = JSON.parse(String(init?.body));
        return Response.json(body.action === "prepareUpload"
          ? {
              uploadUrl: "http://127.0.0.1:8787/upload",
              storageKey: "user/electron.windows/file.zip",
              headers: { "content-type": "application/zip" },
            }
          : { artifact: { uploaded_at: "2026-09-16T00:00:00Z" } });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const task = createPipelabCloudUploadTask(new PipelabContext({ userDataPath: root }));
      await expect(task({
        step: { id: "cloud", uses: "pipelab-cloud:upload" },
        inputs: {},
        delivery: {
          destinationId: "pipelab-cloud-bzohqr1g",
          slotId: "windows",
          artifact: {
            id: "artifact-build-1-0",
            outputId: "electron.windows",
            version: "1.4.0",
            platform: "windows",
            architecture: "x64",
            format: "zip",
            path: source,
            producerStep: "packager-electron-windows",
          },
        },
        workspace: { root },
        filesystem: { ensureDirectory: async () => undefined },
        processes: { execute: vi.fn() },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        signal: new AbortController().signal,
        log: vi.fn(),
        logStream: vi.fn(),
        setArtifact: vi.fn(),
      })).rejects.toThrow("Pipelab Cloud did not return a valid hosted artifact ID");
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires artifact metadata from the workflow delivery context", async () => {
    const task = createPipelabCloudUploadTask(new PipelabContext({ userDataPath: tmpdir() }));

    await expect(
      task({
        step: { id: "cloud", uses: "pipelab-cloud:upload" },
        inputs: {},
        workspace: { root: "/workspace" },
        filesystem: { ensureDirectory: async () => undefined },
        processes: { execute: vi.fn() },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        signal: new AbortController().signal,
        log: vi.fn(),
        logStream: vi.fn(),
        setArtifact: vi.fn(),
      }),
    ).rejects.toThrow("Pipelab Cloud upload requires a resolved workflow delivery artifact");
  });
});
