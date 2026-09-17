import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PipelabContext } from "./context";

const { mockSupabase, mockInvoke } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockSupabase = vi.fn(() => ({
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { is_anonymous: false } } }, error: null })) },
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
  afterEach(() => {
    vi.restoreAllMocks();
    mockInvoke.mockReset();
  });

  it("uploads a file and finalizes its checksum, version, and artifact identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-cloud-test-"));
    const source = join(root, "game.zip");
    await writeFile(source, "game artifact");
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mockInvoke
      .mockResolvedValueOnce({
        data: {
          uploadUrl: "https://r2.example/upload",
          storageKey: "user/electron.windows/file.zip",
          headers: { "content-type": "application/zip" },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { artifact: { expires_at: "2026-09-23T00:00:00Z" } }, error: null });

    try {
      const outputs = await createPipelabCloudUploadTask(
        new PipelabContext({ userDataPath: root }),
      )({
        step: { id: "cloud", uses: "pipelab-cloud:upload" },
        inputs: {
          from: source,
          artifactId: "artifact-build-1-0",
          artifactOutput: "electron.windows",
          version: "1.4.0",
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

      const prepareBody = mockInvoke.mock.calls[0][1].body;
      expect(prepareBody).toMatchObject({
        action: "prepareUpload",
        artifactId: "artifact-build-1-0",
        artifactOutputId: "electron.windows",
        version: "1.4.0",
        size: 13,
        checksum: "6bcef858a9f1335901d8923409b4f1098585fa62cc944b5ce31832ecbf67696a",
      });
      expect(mockInvoke.mock.calls[1][1].body).toMatchObject({
        action: "completeUpload",
        artifactId: "artifact-build-1-0",
        artifactOutputId: "electron.windows",
        version: "1.4.0",
        storageKey: "user/electron.windows/file.zip",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://r2.example/upload",
        expect.objectContaining({
          method: "PUT",
          duplex: "half",
          headers: { "content-type": "application/zip", "content-length": "13" },
        }),
      );
      expect(outputs).toMatchObject({ pinned: true, artifactOutputId: "electron.windows", size: 13 });
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    }
  });
});
