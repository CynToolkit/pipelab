import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { getR2StorageConfig, matchesObjectMetadata } from "../shared/r2-storage.ts";

const outputIds = new Set([
  "electron.windows",
  "electron.linux",
  "electron.macos.arm64",
  "tauri.windows",
  "tauri.linux",
  "tauri.macos.arm64",
  "web.html5",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEYS?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEYS?: string;
  R2_ENDPOINT_URL?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
};

type Artifact = {
  id: string;
  storage_key: string;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getDefaultKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as { default?: unknown };
  return typeof parsed.default === "string" ? parsed.default : undefined;
}

function getSupabaseConfig(env: Env) {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY ?? getDefaultKey(env.SUPABASE_PUBLISHABLE_KEYS);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? getDefaultKey(env.SUPABASE_SECRET_KEYS);
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Pipelab Cloud Supabase configuration is missing");
  }
  return { url, anonKey, serviceRoleKey };
}

function getR2(env: Env) {
  const config = getR2StorageConfig((name) => env[name as keyof Env]);
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: config.local,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return { ...config, client };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function createSupabaseClients(env: Env, authorization: string) {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig(env);
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userClient, admin };
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (new URL(request.url).pathname !== "/") return json({ error: "Not found" }, 404);

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return json({ error: "Sign in to Pipelab Cloud before uploading" }, 401);
  }

  try {
    const { userClient, admin } = createSupabaseClients(env, authorization);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user || user.is_anonymous) {
      return json({ error: "A signed-in Pipelab account is required" }, 401);
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) return json({ error: "Invalid request body" }, 400);
    const storage = getR2(env);

    if (body.action === "prepareUpload") {
      const { artifactId, artifactOutputId, version, size, checksum } = body;
      if (
        typeof artifactId !== "string" ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(artifactId) ||
        typeof artifactOutputId !== "string" ||
        !outputIds.has(artifactOutputId) ||
        typeof version !== "string" ||
        version.length < 1 ||
        version.length > 128 ||
        !Number.isSafeInteger(size) ||
        Number(size) < 0 ||
        Number(size) > 5 * 1024 ** 4 ||
        typeof checksum !== "string" ||
        !/^[a-f0-9]{64}$/.test(checksum)
      )
        return json({ error: "Invalid artifact upload metadata" }, 422);

      if (storage.local && Number(size) > 5 * 1024 ** 3) {
        return json({ error: "Local R2 supports single-part uploads up to 5 GiB" }, 413);
      }

      const storageKey = `${user.id}/${artifactOutputId}/${crypto.randomUUID()}.zip`;
      const metadata = {
        artifactid: artifactId,
        artifactoutputid: artifactOutputId,
        checksum,
        ownerid: user.id,
        version,
      };
      const headers: Record<string, string> = Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [`x-amz-meta-${key}`, value]),
      );
      headers["content-type"] = "application/zip";

      if (Number(size) <= 5 * 1024 ** 3) {
        const command = new PutObjectCommand({
          Bucket: storage.bucket,
          Key: storageKey,
          ContentType: "application/zip",
          Metadata: metadata,
        });
        const uploadUrl = await getSignedUrl(storage.client, command, { expiresIn: 900 });
        return json({ uploadUrl, storageKey, headers });
      }

      const started = await storage.client.send(
        new CreateMultipartUploadCommand({
          Bucket: storage.bucket,
          Key: storageKey,
          ContentType: "application/zip",
          Metadata: metadata,
        }),
      );
      if (!started.UploadId) throw new Error("Could not start multipart upload");
      const mib = 1024 * 1024;
      const partSize = Math.ceil(Math.max(64 * mib, Number(size) / 10_000) / mib) * mib;
      return json({ storageKey, uploadId: started.UploadId, partSize, multipart: true });
    }

    if (body.action === "signParts") {
      if (storage.local) {
        return json({ error: "Multipart uploads are only supported with production R2" }, 400);
      }
      const { storageKey, uploadId, partNumbers } = body;
      if (
        typeof storageKey !== "string" ||
        !storageKey.startsWith(`${user.id}/`) ||
        typeof uploadId !== "string" ||
        uploadId.length > 1024 ||
        !Array.isArray(partNumbers) ||
        partNumbers.length < 1 ||
        partNumbers.length > 50 ||
        !partNumbers.every((part) => Number.isInteger(part) && part >= 1 && part <= 10_000)
      )
        return json({ error: "Invalid multipart upload request" }, 422);

      await storage.client.send(
        new ListPartsCommand({
          Bucket: storage.bucket,
          Key: storageKey,
          UploadId: uploadId,
        }),
      );
      const parts = await Promise.all(
        partNumbers.map(async (partNumber) => ({
          partNumber,
          url: await getSignedUrl(
            storage.client,
            new UploadPartCommand({
              Bucket: storage.bucket,
              Key: storageKey,
              UploadId: uploadId,
              PartNumber: partNumber,
            }),
            { expiresIn: 900 },
          ),
        })),
      );
      return json({ parts });
    }

    if (body.action === "abortUpload") {
      if (storage.local) {
        return json({ error: "Multipart uploads are only supported with production R2" }, 400);
      }
      const { storageKey, uploadId } = body;
      if (
        typeof storageKey !== "string" ||
        !storageKey.startsWith(`${user.id}/`) ||
        typeof uploadId !== "string"
      )
        return json({ error: "Invalid multipart upload request" }, 422);
      await storage.client.send(
        new AbortMultipartUploadCommand({
          Bucket: storage.bucket,
          Key: storageKey,
          UploadId: uploadId,
        }),
      );
      return json({ aborted: true });
    }

    if (body.action === "completeUpload") {
      const { artifactId, artifactOutputId, version, size, checksum, storageKey, uploadId, parts } =
        body;
      if (
        typeof artifactId !== "string" ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(artifactId) ||
        typeof artifactOutputId !== "string" ||
        !outputIds.has(artifactOutputId) ||
        typeof version !== "string" ||
        version.length < 1 ||
        version.length > 128 ||
        !Number.isSafeInteger(size) ||
        Number(size) < 0 ||
        Number(size) > 5 * 1024 ** 4 ||
        typeof checksum !== "string" ||
        !/^[a-f0-9]{64}$/.test(checksum) ||
        typeof storageKey !== "string" ||
        !storageKey.startsWith(`${user.id}/${artifactOutputId}/`)
      )
        return json({ error: "Invalid artifact upload metadata" }, 422);

      if (storage.local && uploadId !== undefined) {
        return json({ error: "Multipart uploads are only supported with production R2" }, 400);
      }
      if (uploadId !== undefined) {
        if (
          typeof uploadId !== "string" ||
          !Array.isArray(parts) ||
          parts.length < 1 ||
          parts.length > 10_000 ||
          !parts.every(
            (part) =>
              Number.isInteger(part?.PartNumber) &&
              part.PartNumber >= 1 &&
              part.PartNumber <= 10_000 &&
              typeof part.ETag === "string",
          )
        )
          return json({ error: "Invalid multipart completion request" }, 422);
        await storage.client.send(
          new CompleteMultipartUploadCommand({
            Bucket: storage.bucket,
            Key: storageKey,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
          }),
        );
      }

      const expectedMetadata = {
        ownerid: user.id,
        artifactid: artifactId,
        artifactoutputid: artifactOutputId,
        version,
        checksum,
      };
      const head = await storage.client.send(
        new HeadObjectCommand({
          Bucket: storage.bucket,
          Key: storageKey,
        }),
      );
      if (
        !matchesObjectMetadata(
          {
            ContentLength: head.ContentLength ?? -1,
            Metadata: head.Metadata ?? {},
          },
          Number(size),
          expectedMetadata,
        )
      ) {
        return json({ error: "Uploaded object does not match its metadata" }, 422);
      }

      const uploadedAt = new Date();
      const expiresAt = new Date(uploadedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data: artifact, error } = await admin.rpc("record_pipelab_cloud_artifact", {
        p_user_id: user.id,
        p_artifact_id: artifactId,
        p_artifact_output_id: artifactOutputId,
        p_version: version,
        p_size: size,
        p_checksum: checksum,
        p_storage_key: storageKey,
        p_uploaded_at: uploadedAt.toISOString(),
        p_expires_at: expiresAt.toISOString(),
      });
      if (error) throw error;
      return json({ artifact });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("Pipelab Cloud request failed", error);
    return json({ error: "Pipelab Cloud request failed" }, 500);
  }
}

export async function cleanupExpiredArtifacts(env: Env) {
  const { url, serviceRoleKey } = getSupabaseConfig(env);
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = getR2(env);
  const { data: artifacts, error: claimError } = await admin.rpc(
    "claim_expired_pipelab_cloud_artifacts",
    { p_limit: 100 },
  );
  if (claimError) throw claimError;

  let deleted = 0;
  let failed = 0;
  for (const artifact of (artifacts ?? []) as Artifact[]) {
    try {
      await storage.client.send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: artifact.storage_key,
        }),
      );
      const { error } = await admin.rpc("finish_pipelab_cloud_artifact_cleanup", {
        p_artifact_id: artifact.id,
        p_result: "deleted",
      });
      if (error) throw error;
      deleted++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Could not clean up hosted artifact", artifact.id, message);
      await admin.rpc("finish_pipelab_cloud_artifact_cleanup", {
        p_artifact_id: artifact.id,
        p_result: "failed",
        p_message: message.slice(0, 1000),
      });
      failed++;
    }
  }

  console.log("Pipelab Cloud cleanup completed", { deleted, failed });
  return { deleted, failed };
}

export async function handleScheduled(_controller: unknown, env: Env, context: ExecutionContext) {
  context.waitUntil(cleanupExpiredArtifacts(env));
}

export default {
  fetch: handleRequest,
  scheduled: handleScheduled,
};
