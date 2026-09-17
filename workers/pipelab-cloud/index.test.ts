import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

vi.mock("@aws-sdk/client-s3", () => {
  const makeCommand = (commandName: string) =>
    class {
      constructor(readonly input: unknown) {}
      readonly commandName = commandName;
    };
  return {
    S3Client: class {
      send = mocks.send;
      constructor(readonly config: unknown) {}
    },
    AbortMultipartUploadCommand: makeCommand("AbortMultipartUploadCommand"),
    CompleteMultipartUploadCommand: makeCommand("CompleteMultipartUploadCommand"),
    CreateMultipartUploadCommand: makeCommand("CreateMultipartUploadCommand"),
    DeleteObjectCommand: makeCommand("DeleteObjectCommand"),
    HeadObjectCommand: makeCommand("HeadObjectCommand"),
    ListPartsCommand: makeCommand("ListPartsCommand"),
    PutObjectCommand: makeCommand("PutObjectCommand"),
    UploadPartCommand: makeCommand("UploadPartCommand"),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

import worker, { handleRequest, handleScheduled } from "./index";

const env = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "local-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
  R2_ENDPOINT_URL: "http://127.0.0.1:8787",
  R2_ACCESS_KEY_ID: "local",
  R2_SECRET_ACCESS_KEY: "local",
  R2_BUCKET_NAME: "pipelab-cloud-local",
};

const authorizedRequest = (body: unknown) =>
  new Request("http://localhost:8788/", {
    method: "POST",
    headers: { authorization: "Bearer user-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Pipelab Cloud Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", is_anonymous: false } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.getSignedUrl.mockResolvedValue(
      "http://127.0.0.1:8787/pipelab-cloud-local/user-1/electron.windows/build.zip",
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("exports a Worker fetch handler", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof worker.scheduled).toBe("function");
  });

  it("returns CORS preflight without requiring credentials", async () => {
    const response = await handleRequest(
      new Request("http://localhost:8788/", { method: "OPTIONS" }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  });

  it("rejects uploads without a bearer token", async () => {
    const response = await handleRequest(
      new Request("http://localhost:8788/", { method: "POST", body: "{}" }),
      env,
    );

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects anonymous Supabase accounts", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "anonymous-1", is_anonymous: true } },
      error: null,
    });

    const response = await handleRequest(authorizedRequest({ action: "prepareUpload" }), env);

    expect(response.status).toBe(401);
  });

  it("creates a signed single-part upload for the authenticated user", async () => {
    const response = await handleRequest(
      authorizedRequest({
        action: "prepareUpload",
        artifactId: "build-1",
        artifactOutputId: "electron.windows",
        version: "1.4.0",
        size: 42,
        checksum: "a".repeat(64),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uploadUrl: expect.stringContaining("127.0.0.1:8787"),
      headers: { "content-type": "application/zip", "x-amz-meta-ownerid": "user-1" },
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledOnce();
  });

  it("keeps local uploads single-part while retaining production multipart uploads", async () => {
    const body = {
      action: "prepareUpload",
      artifactId: "build-1",
      artifactOutputId: "electron.windows",
      version: "1.4.0",
      size: 5 * 1024 ** 3 + 1,
      checksum: "a".repeat(64),
    };
    const localResponse = await handleRequest(authorizedRequest(body), env);
    expect(localResponse.status).toBe(413);

    mocks.send.mockResolvedValue({ UploadId: "upload-1" });
    const productionResponse = await handleRequest(authorizedRequest(body), {
      ...env,
      R2_ENDPOINT_URL: undefined,
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "production-bucket",
    });

    expect(productionResponse.status).toBe(200);
    expect(await productionResponse.json()).toMatchObject({
      multipart: true,
      uploadId: "upload-1",
    });
  });

  it("verifies uploaded object metadata before recording it", async () => {
    const checksum = "b".repeat(64);
    mocks.send.mockResolvedValue({
      ContentLength: 42,
      Metadata: {
        ownerid: "user-1",
        artifactid: "build-1",
        artifactoutputid: "electron.windows",
        version: "1.4.0",
        checksum,
      },
    });
    mocks.rpc.mockResolvedValue({ data: { id: "artifact-row" }, error: null });

    const response = await handleRequest(
      authorizedRequest({
        action: "completeUpload",
        artifactId: "build-1",
        artifactOutputId: "electron.windows",
        version: "1.4.0",
        size: 42,
        checksum,
        storageKey: "user-1/electron.windows/build.zip",
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ artifact: { id: "artifact-row" } });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_pipelab_cloud_artifact",
      expect.objectContaining({
        p_user_id: "user-1",
        p_storage_key: "user-1/electron.windows/build.zip",
      }),
    );
  });

  it("deletes expired objects and records successful scheduled cleanup", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ id: "expired-1", storage_key: "user-1/electron.windows/old.zip" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    let scheduled: Promise<unknown> | undefined;

    await handleScheduled({ cron: "17 * * * *", scheduledTime: Date.now() } as never, env, {
      waitUntil: (promise: Promise<unknown>) => {
        scheduled = promise;
      },
    } as never);
    await scheduled;

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        commandName: "DeleteObjectCommand",
      }),
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_pipelab_cloud_artifact_cleanup", {
      p_artifact_id: "expired-1",
      p_result: "deleted",
    });
  });
});
