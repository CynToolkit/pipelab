import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
  getSignedUrl: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
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
    GetObjectCommand: makeCommand("GetObjectCommand"),
    UploadPartCommand: makeCommand("UploadPartCommand"),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

import worker, { handleRequest, handleScheduled } from "./index";

const env = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local",
  SUPABASE_ANON_KEY: "legacy-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
  R2_ENDPOINT_URL: "http://127.0.0.1:8787",
  R2_ACCESS_KEY_ID: "local",
  R2_SECRET_ACCESS_KEY: "local",
  R2_BUCKET_NAME: "pipelab-cloud-local",
  PIPELAB_CLOUD_LINK_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

const reservationId = "00000000-0000-4000-8000-000000000099";
const artifactBytes = Buffer.alloc(42, 7);
const artifactChecksum = createHash("sha256").update(artifactBytes).digest("hex");
const artifactContentMd5 = createHash("md5").update(artifactBytes).digest("base64");
const uploadReservation = {
  id: reservationId,
  storage_key: "user-1/00000000-0000-4000-8000-000000000098.artifact",
  artifact_id: "build-1",
  artifact_output_id: "electron.windows",
  project_id: "project-1",
  build_profile_id: "profile-1",
  build_target_id: "windows-x64",
  version: "1.4.0",
  original_name: "release-build",
  artifact_kind: "directory",
  size: 42,
  checksum: artifactChecksum,
  multipart_upload_id: null as string | null,
  expires_at: "2099-09-25T00:00:00Z",
};

const authorizedRequest = (body: unknown) =>
  new Request("http://localhost:8788/", {
    method: "POST",
    headers: { authorization: "Bearer user-token", "content-type": "application/json" },
    body: JSON.stringify({
      projectId: "project-1",
      buildProfileId: "profile-1",
      buildTargetId: "windows-x64",
      originalName: "release-build",
      artifactKind: "directory",
      contentMd5: artifactContentMd5,
      ...(body && typeof body === "object" ? body : {}),
    }),
  });

describe("Pipelab Cloud Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptions: [
              {
                status: "active",
                product: { id: "plan-basic" },
                currentPeriodEnd: "2099-09-25T00:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    mocks.createClient.mockImplementation(() => ({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
      from: mocks.from,
    }));
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", is_anonymous: false } },
      error: null,
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "reserve_pipelab_cloud_artifact_upload") {
        return Promise.resolve({ data: { id: reservationId }, error: null });
      }
      if (name === "commit_pipelab_cloud_artifact_upload") {
        return Promise.resolve({
          data: { id: "00000000-0000-4000-8000-000000000001", uploaded_at: "2026-09-18T00:00:00Z" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mocks.from.mockImplementation((table: string) => {
      const data =
        table === "pipelab_cloud_plan_limits"
          ? {
              product_id: "plan-basic",
              tier_name: "Basic",
              quota_bytes: 12 * 1024 ** 3,
              history_retention_days: 30,
            }
          : table === "hosted_artifact_upload_reservations"
            ? uploadReservation
            : table === "hosted_artifact_share_links"
              ? {
                  id: "share-link-1",
                  artifact_id: "00000000-0000-4000-8000-000000000001",
                  user_id: "user-1",
                  encrypted_token: "AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA",
                  token_hash: "a".repeat(64),
                }
              : table === "pipelab_cloud_account_state"
                ? {
                    user_id: "user-1",
                    entitlement_status: "active",
                    grace_until: null,
                    quota_bytes: 12 * 1024 ** 3,
                    retention_days: 30,
                  }
                : table === "pipelab_cloud_notifications"
                  ? { id: "notice-1", message: "Warning", deadline_at: "2099-01-01T00:00:00Z" }
                  : {
                      id: "00000000-0000-4000-8000-000000000001",
                      artifact_id: "build-1",
                      artifact_output_id: "electron.windows",
                      project_id: "project-1",
                      build_profile_id: "profile-1",
                      build_target_id: "windows-x64",
                      original_name: "release-build",
                      artifact_kind: "directory",
                      size: 42,
                      uploaded_at: "2026-09-18T00:00:00Z",
                      expires_at: "2026-09-25T00:00:00Z",
                      pinned: true,
                      deletion_requested_at: null,
                      storage_key: "user-1/build.zip",
                    };
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        neq: vi.fn(),
        is: vi.fn(),
        lte: vi.fn(),
        or: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        in: vi.fn(),
        update: vi.fn(),
        insert: vi.fn(async () => ({ error: null })),
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.neq.mockReturnValue(query);
      query.is.mockReturnValue(query);
      query.lte.mockReturnValue(query);
      query.or.mockReturnValue(query);
      query.order.mockReturnValue(query);
      query.limit.mockReturnValue(query);
      query.in.mockReturnValue(query);
      query.update.mockReturnValue(query);
      Object.assign(query, {
        then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
          Promise.resolve({ data: [data], error: null }).then(resolve, reject),
      });
      return query;
    });
    mocks.getSignedUrl.mockResolvedValue(
      "http://127.0.0.1:8787/pipelab-cloud-local/user-1/electron.windows/build.zip",
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    uploadReservation.multipart_upload_id = null;
  });

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

  it("uses the publishable key for the API key while forwarding the user JWT separately", async () => {
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
    expect(mocks.createClient).toHaveBeenNthCalledWith(
      1,
      env.SUPABASE_URL,
      env.SUPABASE_PUBLISHABLE_KEY,
      expect.objectContaining({
        global: { headers: { Authorization: "Bearer user-token" } },
      }),
    );
    expect(mocks.createClient).toHaveBeenNthCalledWith(
      2,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      expect.any(Object),
    );
  });

  it("continues to accept the legacy key when the publishable key is absent", async () => {
    const legacyEnv = { ...env, SUPABASE_PUBLISHABLE_KEY: undefined };
    const response = await handleRequest(
      authorizedRequest({
        action: "prepareUpload",
        artifactId: "build-1",
        artifactOutputId: "electron.windows",
        version: "1.4.0",
        size: 42,
        checksum: "a".repeat(64),
      }),
      legacyEnv,
    );

    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenNthCalledWith(
      1,
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      expect.objectContaining({
        global: { headers: { Authorization: "Bearer user-token" } },
      }),
    );
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
    const body = await response.json();
    expect(body).toMatchObject({
      uploadUrl: expect.stringContaining("127.0.0.1:8787"),
      headers: {
        "content-type": "application/zip",
        "content-length": "42",
        "content-md5": artifactContentMd5,
        "if-none-match": "*",
        "x-amz-meta-ownerid": "user-1",
      },
    });
    expect(JSON.stringify(body)).not.toContain("storageKey");
    expect(mocks.getSignedUrl).toHaveBeenCalledOnce();
    expect(mocks.getSignedUrl.mock.calls[0]?.[1]).toMatchObject({
      input: {
        ContentLength: 42,
        ContentMD5: artifactContentMd5,
        IfNoneMatch: "*",
      },
    });
  });

  it("signs multipart part URLs with the expected part checksum", async () => {
    uploadReservation.multipart_upload_id = "upload-1";
    mocks.send.mockResolvedValue({});

    const response = await handleRequest(
      authorizedRequest({
        action: "signParts",
        reservationId,
        partNumbers: [1],
        partChecksums: [{ partNumber: 1, contentMd5: artifactContentMd5 }],
      }),
      {
        ...env,
        R2_ENDPOINT_URL: undefined,
        R2_ACCOUNT_ID: "account",
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.getSignedUrl.mock.calls[0]?.[1]).toMatchObject({
      input: { ContentMD5: artifactContentMd5, PartNumber: 1, UploadId: "upload-1" },
    });
    expect(await response.json()).toMatchObject({
      parts: [{ partNumber: 1, headers: { "content-md5": artifactContentMd5 } }],
    });
    uploadReservation.multipart_upload_id = null;
  });

  it("rejects multipart signing requests without a valid checksum for every part", async () => {
    const response = await handleRequest(
      authorizedRequest({ action: "signParts", reservationId, partNumbers: [1] }),
      { ...env, R2_ENDPOINT_URL: undefined, R2_ACCOUNT_ID: "account" },
    );

    expect(response.status).toBe(422);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("returns a short-lived signed URL for an owned hosted artifact without exposing its storage key", async () => {
    const response = await handleRequest(
      authorizedRequest({
        action: "getArtifactDownloadUrl",
        hostedArtifactId: "00000000-0000-4000-8000-000000000001",
      }),
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      downloadUrl: expect.stringContaining("127.0.0.1:8787"),
      artifact: { id: "00000000-0000-4000-8000-000000000001", pinned: true },
    });
    expect(JSON.stringify(body)).not.toContain("storage_key");
    expect(mocks.getSignedUrl).toHaveBeenCalledOnce();
  });

  it("lists only safe hosted-artifact metadata and pooled usage", async () => {
    const response = await handleRequest(authorizedRequest({ action: "listArtifacts" }), env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      usage: { usedBytes: 42, quotaBytes: 12 * 1024 ** 3, retentionDays: 30 },
      entitlement: { status: "active" },
    });
    expect(JSON.stringify(body)).not.toContain("storage_key");
  });

  it("serves an anonymous share link through a short-lived redirect", async () => {
    const response = await handleRequest(
      new Request(`https://cloud.example/share/${"a".repeat(43)}`),
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.getUser).not.toHaveBeenCalled();
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
    const checksum = artifactChecksum;
    mocks.send.mockResolvedValue({
      ContentLength: 42,
      Metadata: {
        ownerid: "user-1",
        artifactid: "build-1",
        artifactoutputid: "electron.windows",
        projectid: "project-1",
        buildprofileid: "profile-1",
        buildtargetid: "windows-x64",
        version: "1.4.0",
        checksum,
      },
    });
    mocks.rpc.mockResolvedValue({ data: { id: "artifact-row" }, error: null });

    const response = await handleRequest(
      authorizedRequest({
        action: "completeUpload",
        reservationId,
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ artifact: { id: "artifact-row" } });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "commit_pipelab_cloud_artifact_upload",
      expect.objectContaining({
        p_user_id: "user-1",
        p_reservation_id: reservationId,
        p_actual_size: 42,
        p_current_retention_days: 30,
      }),
    );
  });

  it("deletes expired objects and records successful scheduled cleanup", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
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
    expect(mocks.rpc).toHaveBeenCalledWith("finish_pipelab_cloud_artifact_cleanup", {
      p_artifact_id: "expired-1",
      p_result: "deleted",
    });
  });

  it("does not start new grace deletions while subscription reconciliation is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    let scheduled: Promise<unknown> | undefined;

    await handleScheduled({ cron: "17 * * * *", scheduledTime: Date.now() } as never, env, {
      waitUntil: (promise: Promise<unknown>) => {
        scheduled = promise;
      },
    } as never);
    await scheduled;

    expect(mocks.rpc).not.toHaveBeenCalledWith("start_pipelab_cloud_grace_periods");
    expect(mocks.rpc).toHaveBeenCalledWith("claim_expired_pipelab_cloud_artifacts", {
      p_limit: 100,
      p_verified_user_ids: [],
    });
  });

  it("passes only the successfully reconciled account batch to deletion eligibility", async () => {
    const accounts = Array.from({ length: 101 }, (_, index) => ({
      user_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      is: vi.fn(),
      lte: vi.fn(),
      or: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      in: vi.fn(),
      update: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
        Promise.resolve({ data: accounts, error: null }).then(resolve, reject),
    };
    for (const method of [
      "select",
      "eq",
      "neq",
      "is",
      "lte",
      "or",
      "order",
      "limit",
      "in",
      "update",
    ] as const) {
      query[method].mockReturnValue(query);
    }
    mocks.from.mockReturnValue(query);

    let scheduled: Promise<unknown> | undefined;
    await handleScheduled({ cron: "17 * * * *", scheduledTime: Date.now() } as never, env, {
      waitUntil: (promise: Promise<unknown>) => {
        scheduled = promise;
      },
    } as never);
    await scheduled;

    const verifiedIds = accounts.slice(0, 100).map((account) => account.user_id);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_expired_pipelab_cloud_artifacts", {
      p_limit: 100,
      p_verified_user_ids: verifiedIds,
    });
    expect(verifiedIds).not.toContain(accounts[100]?.user_id);
  });

  it("releases failed warning emails and continues sending the rest of the claim batch", async () => {
    const warnings = [
      { user_id: "warning-1", email: "one@example.com", deadline_at: "2026-11-01T00:00:00Z" },
      { user_id: "warning-2", email: "two@example.com", deadline_at: "2026-11-01T00:00:00Z" },
    ];
    const emailFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== "https://api.resend.com/emails") {
        return new Response(
          JSON.stringify({
            subscriptions: [
              {
                status: "active",
                product: { id: "plan-basic" },
                currentPeriodEnd: "2099-09-25T00:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (
        emailFetch.mock.calls.filter(([url]) => String(url) === "https://api.resend.com/emails")
          .length === 1
      ) {
        throw new Error("email service unavailable");
      }
      return new Response("sent", { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "claim_pipelab_cloud_deletion_warnings") {
        return Promise.resolve({ data: warnings, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    let scheduled: Promise<unknown> | undefined;
    await handleScheduled(
      { cron: "17 * * * *", scheduledTime: Date.now() } as never,
      { ...env, RESEND_API_KEY: "local-resend-key", PIPELAB_CLOUD_FROM_EMAIL: "cloud@example.com" },
      {
        waitUntil: (promise: Promise<unknown>) => {
          scheduled = promise;
        },
      } as never,
    );
    await expect(scheduled).resolves.toBeDefined();

    expect(mocks.rpc).toHaveBeenCalledWith("release_pipelab_cloud_deletion_warning", {
      p_user_id: "warning-1",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_pipelab_cloud_deletion_warning", {
      p_user_id: "warning-2",
    });
  });
});
