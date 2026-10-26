import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { getR2StorageConfig, matchesObjectMetadata } from "../shared/r2-storage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** @deprecated Keep the old deployment variable during the migration window. */
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEYS?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEYS?: string;
  R2_ENDPOINT_URL?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  PIPELAB_CLOUD_LINK_ENCRYPTION_KEY?: string;
  RESEND_API_KEY?: string;
  PIPELAB_CLOUD_FROM_EMAIL?: string;
};

type Artifact = {
  id: string;
  storage_key: string;
};

type CloudPlan = {
  productId: string;
  tierName: string;
  quotaBytes: number;
  retentionDays: number;
  paidThroughAt: string;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const validIdentity = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);

const validArtifactName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 255 &&
  !/[\\/\u0000-\u001f\u007f]/.test(value) &&
  value !== "." &&
  value !== "..";

const contentTypeFor = (kind: "file" | "directory") =>
  kind === "directory" ? "application/zip" : "application/octet-stream";

const contentDispositionFor = (name: string) => {
  const safeName = name.replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${safeName}"`;
};

const safePositiveInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
};

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const base64 = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

const hashShareToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

async function shareEncryptionKey(env: Env) {
  const encoded = env.PIPELAB_CLOUD_LINK_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Pipelab Cloud share-link encryption is not configured");
  const bytes = fromBase64Url(encoded);
  if (bytes.byteLength !== 32) throw new Error("Pipelab Cloud share-link key must be 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptShareToken(token: string, env: Env) {
  const key = await shareEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptShareToken(value: string, env: Env) {
  const [encodedIv, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedCiphertext) throw new Error("Pipelab Cloud share link is invalid");
  const key = await shareEncryptionKey(env);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(encodedIv) },
    key,
    fromBase64Url(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

const randomShareToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

function getDefaultKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as { default?: unknown };
  return typeof parsed.default === "string" ? parsed.default : undefined;
}

function getSupabaseConfig(env: Env) {
  const url = env.SUPABASE_URL;
  const publishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    getDefaultKey(env.SUPABASE_PUBLISHABLE_KEYS);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? getDefaultKey(env.SUPABASE_SECRET_KEYS);
  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error("Pipelab Cloud Supabase configuration is missing");
  }
  return { url, publishableKey, serviceRoleKey };
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

function isContentMd5(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(value)) return false;
  try {
    return atob(value).length === 16;
  } catch {
    return false;
  }
}

function createSupabaseClients(env: Env, authorization: string) {
  const { url, publishableKey, serviceRoleKey } = getSupabaseConfig(env);
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userClient, admin };
}

async function resolveCloudPlan(
  authorization: string,
  admin: ReturnType<typeof createSupabaseClients>["admin"],
  env: Env,
  userId: string,
): Promise<CloudPlan | null> {
  const { url, publishableKey } = getSupabaseConfig(env);
  const response = await fetch(new URL("/functions/v1/polar-user-plan", url), {
    method: "POST",
    headers: {
      Accept: "application/json",
      apikey: publishableKey,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: "{}",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Pipelab Cloud billing lookup failed");
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.subscriptions)) {
    throw new Error("Pipelab Cloud billing response is invalid");
  }

  const candidates: CloudPlan[] = [];
  for (const value of payload.subscriptions) {
    if (!isRecord(value) || !isRecord(value.product)) continue;
    const productId = value.product.id;
    const paidThroughAt = value.currentPeriodEnd;
    if (
      typeof productId !== "string" ||
      (value.status !== "active" && value.status !== "canceled") ||
      typeof paidThroughAt !== "string" ||
      Date.parse(paidThroughAt) <= Date.now()
    )
      continue;

    const { data: plan, error } = await admin
      .from("pipelab_cloud_plan_limits")
      .select("product_id, tier_name, quota_bytes, history_retention_days")
      .eq("product_id", productId)
      .eq("enabled", true)
      .maybeSingle();
    if (error) throw error;
    const quotaBytes = safePositiveInteger(plan?.quota_bytes);
    const retentionDays = safePositiveInteger(plan?.history_retention_days);
    if (
      !plan ||
      typeof plan.product_id !== "string" ||
      typeof plan.tier_name !== "string" ||
      !quotaBytes ||
      !retentionDays ||
      retentionDays > 3650
    )
      continue;
    candidates.push({
      productId: plan.product_id,
      tierName: plan.tier_name,
      quotaBytes,
      retentionDays,
      paidThroughAt,
    });
  }

  candidates.sort((left, right) => right.quotaBytes - left.quotaBytes);
  const activePlan = candidates[0] ?? null;
  if (activePlan) {
    const { error } = await admin.rpc("set_pipelab_cloud_active_entitlement", {
      p_user_id: userId,
      p_plan_product_id: activePlan.productId,
      p_quota_bytes: activePlan.quotaBytes,
      p_retention_days: activePlan.retentionDays,
      p_paid_through_at: activePlan.paidThroughAt,
    });
    if (error) throw error;
  }
  return activePlan;
}

async function serveShareLink(env: Env, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return new Response("Not found", { status: 404 });
  const { admin } = createSupabaseClients(env, "");
  const tokenHash = await hashShareToken(token);
  const { data: link, error: linkError } = await admin
    .from("hosted_artifact_share_links")
    .select("artifact_id, user_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return new Response("Not found", { status: 404 });

  const { data: artifact, error: artifactError } = await admin
    .from("hosted_artifacts")
    .select("storage_key, original_name, artifact_kind, expires_at, pinned, deletion_requested_at")
    .eq("id", link.artifact_id)
    .eq("user_id", link.user_id)
    .maybeSingle();
  if (artifactError) throw artifactError;
  const { data: account, error: accountError } = await admin
    .from("pipelab_cloud_account_state")
    .select("entitlement_status, grace_until")
    .eq("user_id", link.user_id)
    .maybeSingle();
  if (accountError) throw accountError;
  const inGrace =
    account?.entitlement_status === "grace" &&
    typeof account.grace_until === "string" &&
    Date.parse(account.grace_until) > Date.now();
  const accessible = account?.entitlement_status === "active" || inGrace;
  const artifactAvailable =
    artifact &&
    !artifact.deletion_requested_at &&
    (artifact.pinned || Date.parse(artifact.expires_at) > Date.now());
  if (!accessible || !artifactAvailable) return new Response("Not found", { status: 404 });

  const storage = getR2(env);
  const downloadUrl = await getSignedUrl(
    storage.client,
    new GetObjectCommand({
      Bucket: storage.bucket,
      Key: artifact.storage_key,
      ResponseContentDisposition: contentDispositionFor(artifact.original_name),
      ResponseContentType: contentTypeFor(artifact.artifact_kind),
    }),
    { expiresIn: 60 },
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: downloadUrl,
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  const shareMatch = url.pathname.match(/^\/share\/([A-Za-z0-9_-]+)$/u);
  if (request.method === "GET" && shareMatch) {
    try {
      return await serveShareLink(env, shareMatch[1]);
    } catch (error) {
      console.error("Pipelab Cloud share-link request failed", error);
      return new Response("Pipelab Cloud share link is temporarily unavailable", { status: 503 });
    }
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (url.pathname !== "/") return json({ error: "Not found" }, 404);

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
      const {
        artifactId,
        artifactOutputId,
        projectId,
        buildProfileId,
        buildTargetId,
        version,
        size,
        checksum,
        contentMd5,
        partSize: requestedPartSize,
        originalName,
        artifactKind,
      } = body;
      if (
        typeof artifactId !== "string" ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(artifactId) ||
        !validIdentity(artifactOutputId) ||
        !validIdentity(projectId) ||
        !validIdentity(buildProfileId) ||
        !validIdentity(buildTargetId) ||
        !validArtifactName(originalName) ||
        (artifactKind !== "file" && artifactKind !== "directory") ||
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
      if (!isContentMd5(contentMd5)) {
        return json({ error: "Invalid artifact content checksum" }, 422);
      }

      const mib = 1024 * 1024;
      const partSize = Number.isSafeInteger(requestedPartSize)
        ? Number(requestedPartSize)
        : Math.ceil(Math.max(64 * mib, Number(size) / 10_000) / mib) * mib;
      if (
        Number(size) > 5 * 1024 ** 3 &&
        (partSize < 5 * mib ||
          partSize > 5 * 1024 ** 3 ||
          Math.ceil(Number(size) / partSize) > 10_000)
      ) {
        return json({ error: "Invalid multipart upload part size" }, 422);
      }

      if (storage.local && Number(size) > 5 * 1024 ** 3) {
        return json({ error: "Local R2 supports single-part uploads up to 5 GiB" }, 413);
      }

      let plan: CloudPlan | null;
      try {
        plan = await resolveCloudPlan(authorization, admin, env, user.id);
      } catch {
        return json({ error: "Pipelab Cloud billing is temporarily unavailable" }, 503);
      }
      if (!plan) {
        return json({ error: "Pipelab Cloud uploads require an active paid plan" }, 403);
      }

      const storageKey = `${user.id}/${crypto.randomUUID()}.artifact`;
      const metadata = {
        artifactid: artifactId,
        artifactoutputid: artifactOutputId,
        projectid: projectId,
        buildprofileid: buildProfileId,
        buildtargetid: buildTargetId,
        checksum,
        ownerid: user.id,
        version,
      };
      const headers: Record<string, string> = Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [`x-amz-meta-${key}`, value]),
      );
      headers["content-type"] = contentTypeFor(artifactKind);
      const { data: reservation, error: reserveError } = await admin.rpc(
        "reserve_pipelab_cloud_artifact_upload",
        {
          p_user_id: user.id,
          p_storage_key: storageKey,
          p_artifact_id: artifactId,
          p_artifact_output_id: artifactOutputId,
          p_project_id: projectId,
          p_build_profile_id: buildProfileId,
          p_build_target_id: buildTargetId,
          p_version: version,
          p_original_name: originalName,
          p_artifact_kind: artifactKind,
          p_size: size,
          p_checksum: checksum,
          p_quota_bytes: plan.quotaBytes,
          p_retention_days: plan.retentionDays,
        },
      );
      if (reserveError) {
        if (reserveError.message === "pipelab_cloud_quota_exceeded") {
          return json(
            {
              code: "quota_exceeded",
              error:
                "Cloud storage is full. Delete artifacts or upgrade your plan to upload this build.",
            },
            409,
          );
        }
        throw reserveError;
      }
      const reservationId = isRecord(reservation) ? reservation.id : undefined;
      if (typeof reservationId !== "string") {
        throw new Error("Pipelab Cloud did not create an upload reservation");
      }

      let multipartUploadId: string | undefined;
      try {
        if (Number(size) <= 5 * 1024 ** 3) {
          const command = new PutObjectCommand({
            Bucket: storage.bucket,
            Key: storageKey,
            ContentLength: Number(size),
            ContentMD5: contentMd5,
            IfNoneMatch: "*",
            ContentType: contentTypeFor(artifactKind),
            Metadata: metadata,
          });
          const uploadUrl = await getSignedUrl(storage.client, command, { expiresIn: 900 });
          return json({
            uploadUrl,
            reservationId,
            headers: {
              ...headers,
              "content-length": String(size),
              "content-md5": contentMd5,
              "if-none-match": "*",
            },
          });
        }

        const started = await storage.client.send(
          new CreateMultipartUploadCommand({
            Bucket: storage.bucket,
            Key: storageKey,
            ContentType: contentTypeFor(artifactKind),
            Metadata: metadata,
          }),
        );
        multipartUploadId = started.UploadId;
        if (!multipartUploadId) throw new Error("Could not start multipart upload");
        const { error: multipartError } = await admin.rpc("set_pipelab_cloud_multipart_upload", {
          p_user_id: user.id,
          p_reservation_id: reservationId,
          p_multipart_upload_id: multipartUploadId,
        });
        if (multipartError) throw multipartError;
        return json({ reservationId, uploadId: multipartUploadId, partSize, multipart: true });
      } catch (error) {
        if (multipartUploadId) {
          await storage.client
            .send(
              new AbortMultipartUploadCommand({
                Bucket: storage.bucket,
                Key: storageKey,
                UploadId: multipartUploadId,
              }),
            )
            .catch(() => undefined);
        }
        await admin.rpc("release_pipelab_cloud_artifact_upload", {
          p_user_id: user.id,
          p_reservation_id: reservationId,
        });
        throw error;
      }
    }

    if (body.action === "signParts") {
      if (storage.local) {
        return json({ error: "Multipart uploads are only supported with production R2" }, 400);
      }
      const { reservationId, partNumbers } = body;
      const partChecksums = body.partChecksums;
      if (
        typeof reservationId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(reservationId) ||
        !Array.isArray(partNumbers) ||
        partNumbers.length < 1 ||
        partNumbers.length > 50 ||
        !partNumbers.every((part) => Number.isInteger(part) && part >= 1 && part <= 10_000) ||
        new Set(partNumbers).size !== partNumbers.length ||
        !Array.isArray(partChecksums) ||
        partChecksums.length !== partNumbers.length
      )
        return json({ error: "Invalid multipart upload request" }, 422);

      const checksumByPart = new Map<number, string>();
      for (const entry of partChecksums) {
        if (
          !isRecord(entry) ||
          typeof entry.partNumber !== "number" ||
          !Number.isInteger(entry.partNumber) ||
          !isContentMd5(entry.contentMd5)
        ) {
          return json({ error: "Invalid multipart upload checksum" }, 422);
        }
        checksumByPart.set(entry.partNumber, entry.contentMd5);
      }
      if (partNumbers.some((part) => !checksumByPart.has(Number(part)))) {
        return json({ error: "Invalid multipart upload checksum" }, 422);
      }

      const { data: reservation, error: reservationError } = await admin
        .from("hosted_artifact_upload_reservations")
        .select("storage_key, multipart_upload_id")
        .eq("id", reservationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (reservationError) throw reservationError;
      if (!reservation?.multipart_upload_id) {
        return json({ error: "Multipart upload reservation is unavailable" }, 404);
      }

      await storage.client.send(
        new ListPartsCommand({
          Bucket: storage.bucket,
          Key: reservation.storage_key,
          UploadId: reservation.multipart_upload_id,
        }),
      );
      const parts = await Promise.all(
        partNumbers.map(async (rawPartNumber) => {
          const partNumber = Number(rawPartNumber);
          const contentMd5 = checksumByPart.get(partNumber);
          if (!contentMd5) throw new Error("Invalid multipart upload checksum");
          return {
            partNumber,
            url: await getSignedUrl(
              storage.client,
              new UploadPartCommand({
                Bucket: storage.bucket,
                Key: reservation.storage_key,
                UploadId: reservation.multipart_upload_id,
                PartNumber: partNumber,
                ContentMD5: contentMd5,
              }),
              { expiresIn: 900 },
            ),
            headers: { "content-md5": contentMd5 },
          };
        }),
      );
      return json({ parts });
    }

    if (body.action === "abortUpload") {
      const { reservationId } = body;
      if (typeof reservationId !== "string" || !/^[0-9a-f-]{36}$/i.test(reservationId))
        return json({ error: "Invalid multipart upload request" }, 422);
      const { data: reservation, error: reservationError } = await admin
        .from("hosted_artifact_upload_reservations")
        .select("storage_key, multipart_upload_id")
        .eq("id", reservationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (reservationError) throw reservationError;
      if (!reservation) return json({ aborted: true });
      if (reservation.multipart_upload_id) {
        await storage.client.send(
          new AbortMultipartUploadCommand({
            Bucket: storage.bucket,
            Key: reservation.storage_key,
            UploadId: reservation.multipart_upload_id,
          }),
        );
      }
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.bucket, Key: reservation.storage_key }),
      );
      const { error: releaseError } = await admin.rpc("release_pipelab_cloud_artifact_upload", {
        p_user_id: user.id,
        p_reservation_id: reservationId,
      });
      if (releaseError) throw releaseError;
      return json({ aborted: true });
    }

    if (body.action === "completeUpload") {
      const { reservationId, uploadId, parts } = body;
      if (typeof reservationId !== "string" || !/^[0-9a-f-]{36}$/i.test(reservationId))
        return json({ error: "Invalid upload reservation" }, 422);

      const { data: reservation, error: reservationError } = await admin
        .from("hosted_artifact_upload_reservations")
        .select("*")
        .eq("id", reservationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (reservationError) throw reservationError;
      if (!reservation) {
        const { data: completed, error: completedError } = await admin
          .from("hosted_artifacts")
          .select("id, uploaded_at")
          .eq("upload_reservation_id", reservationId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (completedError) throw completedError;
        if (completed) return json({ artifact: completed });
        return json({ error: "Upload reservation is unavailable" }, 404);
      }
      const storageKey = reservation.storage_key;

      if (storage.local && uploadId !== undefined) {
        return json({ error: "Multipart uploads are only supported with production R2" }, 400);
      }
      if (uploadId !== undefined) {
        if (
          typeof uploadId !== "string" ||
          uploadId !== reservation.multipart_upload_id ||
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
      } else if (reservation.multipart_upload_id) {
        return json({ error: "Multipart upload completion data is required" }, 422);
      }

      const expectedMetadata = {
        ownerid: user.id,
        artifactid: reservation.artifact_id,
        artifactoutputid: reservation.artifact_output_id,
        projectid: reservation.project_id,
        buildprofileid: reservation.build_profile_id,
        buildtargetid: reservation.build_target_id,
        version: reservation.version,
        checksum: reservation.checksum,
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
          Number(reservation.size),
          expectedMetadata,
        )
      ) {
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.bucket, Key: storageKey }),
        );
        await admin.rpc("release_pipelab_cloud_artifact_upload", {
          p_user_id: user.id,
          p_reservation_id: reservationId,
        });
        return json({ error: "Uploaded object does not match its metadata" }, 422);
      }

      let plan: CloudPlan | null;
      try {
        plan = await resolveCloudPlan(authorization, admin, env, user.id);
      } catch {
        return json({ error: "Pipelab Cloud billing is temporarily unavailable" }, 503);
      }
      if (!plan) {
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.bucket, Key: storageKey }),
        );
        await admin.rpc("release_pipelab_cloud_artifact_upload", {
          p_user_id: user.id,
          p_reservation_id: reservationId,
        });
        return json({ error: "Pipelab Cloud uploads require an active paid plan" }, 403);
      }

      const { data: artifact, error } = await admin.rpc("commit_pipelab_cloud_artifact_upload", {
        p_user_id: user.id,
        p_reservation_id: reservationId,
        p_actual_size: Number(head.ContentLength ?? -1),
        p_current_quota_bytes: plan.quotaBytes,
        p_current_retention_days: plan.retentionDays,
      });
      if (error?.message === "pipelab_cloud_quota_exceeded") {
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.bucket, Key: storageKey }),
        );
        await admin.rpc("release_pipelab_cloud_artifact_upload", {
          p_user_id: user.id,
          p_reservation_id: reservationId,
        });
        return json(
          {
            code: "quota_exceeded",
            error:
              "Cloud storage is full. Delete artifacts or upgrade your plan to upload this build.",
          },
          409,
        );
      }
      if (error) throw error;
      return json({ artifact });
    }

    if (body.action === "listArtifacts") {
      let plan: CloudPlan | null;
      try {
        plan = await resolveCloudPlan(authorization, admin, env, user.id);
      } catch {
        return json({ error: "Pipelab Cloud billing is temporarily unavailable" }, 503);
      }
      const { data: artifacts, error: artifactsError } = await admin
        .from("hosted_artifacts")
        .select(
          "id, artifact_id, artifact_output_id, project_id, build_profile_id, build_target_id, original_name, artifact_kind, size, uploaded_at, expires_at, pinned",
        )
        .eq("user_id", user.id)
        .is("deletion_requested_at", null)
        .order("uploaded_at", { ascending: false });
      if (artifactsError) throw artifactsError;
      const { data: storedRows, error: usageError } = await admin
        .from("hosted_artifacts")
        .select("size")
        .eq("user_id", user.id);
      if (usageError) throw usageError;
      const { data: account, error: accountError } = await admin
        .from("pipelab_cloud_account_state")
        .select("entitlement_status, grace_until, quota_bytes, retention_days")
        .eq("user_id", user.id)
        .maybeSingle();
      if (accountError) throw accountError;
      const { data: links, error: linksError } = await admin
        .from("hosted_artifact_share_links")
        .select("artifact_id")
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (linksError) throw linksError;
      const { data: notifications, error: notificationsError } = await admin
        .from("pipelab_cloud_notifications")
        .select("id, kind, deadline_at, message, created_at")
        .eq("user_id", user.id)
        .is("resolved_at", null)
        .order("created_at", { ascending: false });
      if (notificationsError) throw notificationsError;
      const artifactList = Array.isArray(artifacts) ? artifacts : [];
      const shareArtifactIds = new Set(
        (Array.isArray(links) ? links : []).map((link) => link.artifact_id),
      );
      const usedBytes = (Array.isArray(storedRows) ? storedRows : []).reduce(
        (total, artifact) => total + Number(artifact.size || 0),
        0,
      );
      return json({
        artifacts: artifactList.map((artifact) => ({
          id: artifact.id,
          artifact_id: artifact.artifact_id,
          artifact_output_id: artifact.artifact_output_id,
          project_id: artifact.project_id,
          build_profile_id: artifact.build_profile_id,
          build_target_id: artifact.build_target_id,
          original_name: artifact.original_name,
          artifact_kind: artifact.artifact_kind,
          size: artifact.size,
          uploaded_at: artifact.uploaded_at,
          expires_at: artifact.expires_at,
          pinned: artifact.pinned,
          hasShareLink: shareArtifactIds.has(artifact.id),
        })),
        usage: {
          usedBytes,
          quotaBytes: plan?.quotaBytes ?? safePositiveInteger(account?.quota_bytes) ?? null,
          retentionDays:
            plan?.retentionDays ?? safePositiveInteger(account?.retention_days) ?? null,
        },
        entitlement: {
          status: plan ? "active" : (account?.entitlement_status ?? "none"),
          graceUntil: account?.grace_until ?? null,
        },
        notifications: Array.isArray(notifications) ? notifications : [],
      });
    }

    if (body.action === "getShareLink" || body.action === "createShareLink") {
      const { hostedArtifactId } = body;
      if (typeof hostedArtifactId !== "string" || !/^[0-9a-f-]{36}$/i.test(hostedArtifactId))
        return json({ error: "Invalid hosted artifact ID" }, 422);
      const { data: existingLink, error: existingLinkError } = await admin
        .from("hosted_artifact_share_links")
        .select("id, encrypted_token")
        .eq("artifact_id", hostedArtifactId)
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();
      if (existingLinkError) throw existingLinkError;
      if (existingLink) {
        const token = await decryptShareToken(existingLink.encrypted_token, env);
        return json({ shareUrl: new URL(`/share/${token}`, url.origin).toString() });
      }
      if (body.action === "getShareLink") return json({ shareUrl: null });

      let plan: CloudPlan | null;
      try {
        plan = await resolveCloudPlan(authorization, admin, env, user.id);
      } catch {
        return json({ error: "Pipelab Cloud billing is temporarily unavailable" }, 503);
      }
      if (!plan)
        return json({ error: "A paid Pipelab Cloud plan is required to create share links" }, 403);
      const { data: artifact, error: artifactError } = await admin
        .from("hosted_artifacts")
        .select("id, expires_at, pinned, deletion_requested_at")
        .eq("id", hostedArtifactId)
        .eq("user_id", user.id)
        .is("deletion_requested_at", null)
        .maybeSingle();
      if (artifactError) throw artifactError;
      if (
        !artifact ||
        artifact.deletion_requested_at ||
        (!artifact.pinned && Date.parse(artifact.expires_at) <= Date.now())
      )
        return json({ error: "Hosted artifact is unavailable" }, 404);

      const token = randomShareToken();
      const { error: insertError } = await admin.from("hosted_artifact_share_links").insert({
        user_id: user.id,
        artifact_id: artifact.id,
        token_hash: await hashShareToken(token),
        encrypted_token: await encryptShareToken(token, env),
      });
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: concurrentLink, error: concurrentError } = await admin
            .from("hosted_artifact_share_links")
            .select("encrypted_token")
            .eq("artifact_id", hostedArtifactId)
            .eq("user_id", user.id)
            .is("revoked_at", null)
            .maybeSingle();
          if (concurrentError) throw concurrentError;
          if (concurrentLink) {
            const existingToken = await decryptShareToken(concurrentLink.encrypted_token, env);
            return json({ shareUrl: new URL(`/share/${existingToken}`, url.origin).toString() });
          }
        }
        throw insertError;
      }
      return json({ shareUrl: new URL(`/share/${token}`, url.origin).toString() });
    }

    if (body.action === "revokeShareLink") {
      const { hostedArtifactId } = body;
      if (typeof hostedArtifactId !== "string" || !/^[0-9a-f-]{36}$/i.test(hostedArtifactId))
        return json({ error: "Invalid hosted artifact ID" }, 422);
      const { error } = await admin
        .from("hosted_artifact_share_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("artifact_id", hostedArtifactId)
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (error) throw error;
      return json({ revoked: true });
    }

    if (body.action === "deleteArtifact") {
      const { hostedArtifactId } = body;
      if (typeof hostedArtifactId !== "string" || !/^[0-9a-f-]{36}$/i.test(hostedArtifactId))
        return json({ error: "Invalid hosted artifact ID" }, 422);
      const { data: artifact, error: artifactError } = await admin
        .from("hosted_artifacts")
        .select("id, storage_key")
        .eq("id", hostedArtifactId)
        .eq("user_id", user.id)
        .is("deletion_requested_at", null)
        .maybeSingle();
      if (artifactError) throw artifactError;
      if (!artifact) return json({ deleted: true });
      const now = new Date().toISOString();
      const { error: markError } = await admin
        .from("hosted_artifacts")
        .update({
          pinned: false,
          deletion_requested_at: now,
          deletion_reason: "owner",
          cleanup_claimed_at: now,
        })
        .eq("id", hostedArtifactId)
        .eq("user_id", user.id);
      if (markError) throw markError;
      const { error: revokeError } = await admin
        .from("hosted_artifact_share_links")
        .update({ revoked_at: now })
        .eq("artifact_id", hostedArtifactId)
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (revokeError) throw revokeError;
      try {
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.bucket, Key: artifact.storage_key }),
        );
      } catch (error) {
        await admin.rpc("finish_pipelab_cloud_artifact_cleanup", {
          p_artifact_id: hostedArtifactId,
          p_result: "failed",
          p_message:
            error instanceof Error ? error.message.slice(0, 1000) : "Object deletion failed",
        });
        throw error;
      }
      const { error: finishError } = await admin.rpc("finish_pipelab_cloud_artifact_cleanup", {
        p_artifact_id: hostedArtifactId,
        p_result: "deleted",
      });
      if (finishError) throw finishError;
      return json({ deleted: true });
    }

    if (body.action === "getArtifactDownloadUrl") {
      const { hostedArtifactId } = body;
      if (typeof hostedArtifactId !== "string" || !/^[0-9a-f-]{36}$/i.test(hostedArtifactId))
        return json({ error: "Invalid hosted artifact ID" }, 422);
      const { data: artifact, error } = await admin
        .from("hosted_artifacts")
        .select(
          "id, artifact_id, artifact_output_id, project_id, build_profile_id, build_target_id, original_name, artifact_kind, size, uploaded_at, expires_at, pinned, storage_key, deletion_requested_at",
        )
        .eq("id", hostedArtifactId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      const { data: account, error: accountError } = await admin
        .from("pipelab_cloud_account_state")
        .select("entitlement_status, grace_until")
        .eq("user_id", user.id)
        .maybeSingle();
      if (accountError) throw accountError;
      const inGrace =
        account?.entitlement_status === "grace" &&
        typeof account.grace_until === "string" &&
        Date.parse(account.grace_until) > Date.now();
      if (account?.entitlement_status !== "active" && !inGrace)
        return json({ error: "Pipelab Cloud artifact access has ended" }, 403);
      if (
        !artifact ||
        artifact.deletion_requested_at ||
        (!artifact.pinned && new Date(artifact.expires_at).getTime() <= Date.now())
      )
        return json({ error: "Hosted artifact is unavailable or expired" }, 404);
      const url = await getSignedUrl(
        storage.client,
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: artifact.storage_key,
          ResponseContentDisposition: contentDispositionFor(artifact.original_name),
          ResponseContentType: contentTypeFor(artifact.artifact_kind),
        }),
        { expiresIn: 60 },
      );
      const { storage_key: _storageKey, ...metadata } = artifact;
      void _storageKey;
      return json({ artifact: metadata, downloadUrl: url });
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

  let entitlementChecksSucceeded = false;
  let verifiedUserIds: string[] = [];
  try {
    const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const deadlineCheck = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [{ data: staleAccounts, error: staleError }, { data: graceAccounts, error: graceError }] =
      await Promise.all([
        admin
          .from("pipelab_cloud_account_state")
          .select("user_id")
          .neq("entitlement_status", "deleting")
          .or(`last_entitlement_check_at.is.null,last_entitlement_check_at.lt.${staleBefore}`)
          .order("last_entitlement_check_at", { ascending: true, nullsFirst: true })
          .limit(100),
        admin
          .from("pipelab_cloud_account_state")
          .select("user_id")
          .eq("entitlement_status", "grace")
          .lte("grace_until", deadlineCheck)
          .order("grace_until", { ascending: true })
          .limit(100),
      ]);
    if (staleError) throw staleError;
    if (graceError) throw graceError;
    const userIds = [
      ...new Set(
        [...(graceAccounts ?? []), ...(staleAccounts ?? [])]
          .map((account) => account.user_id)
          .filter((userId): userId is string => typeof userId === "string"),
      ),
    ].slice(0, 100);
    if (userIds.length) {
      const response = await fetch(new URL("/functions/v1/pipelab-cloud-reconcile", url), {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds }),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("Pipelab Cloud entitlement reconciliation failed");
      const { error: checkedError } = await admin
        .from("pipelab_cloud_account_state")
        .update({ last_entitlement_check_at: new Date().toISOString() })
        .in("user_id", userIds);
      if (checkedError) throw checkedError;
      verifiedUserIds = userIds;
    }
    entitlementChecksSucceeded = true;
  } catch {
    console.error(
      "Pipelab Cloud entitlement reconciliation failed; grace transitions will retry next hour",
    );
  }

  if (entitlementChecksSucceeded) {
    const { error: graceError } = await admin.rpc("start_pipelab_cloud_grace_periods");
    if (graceError) throw graceError;
  }

  const { data: reservations, error: reservationClaimError } = await admin.rpc(
    "claim_expired_pipelab_cloud_upload_reservations",
    { p_limit: 100 },
  );
  if (reservationClaimError) throw reservationClaimError;
  let reservationsDeleted = 0;
  let reservationsFailed = 0;
  for (const reservation of (reservations ?? []) as Array<{
    id: string;
    storage_key: string;
    multipart_upload_id?: string | null;
  }>) {
    try {
      if (reservation.multipart_upload_id) {
        await storage.client.send(
          new AbortMultipartUploadCommand({
            Bucket: storage.bucket,
            Key: reservation.storage_key,
            UploadId: reservation.multipart_upload_id,
          }),
        );
      }
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.bucket, Key: reservation.storage_key }),
      );
      const { error } = await admin.rpc("finish_pipelab_cloud_upload_reservation_cleanup", {
        p_reservation_id: reservation.id,
        p_result: "deleted",
      });
      if (error) throw error;
      reservationsDeleted++;
    } catch (error) {
      console.error("Could not clean up a Pipelab Cloud upload reservation", reservation.id);
      await admin.rpc("finish_pipelab_cloud_upload_reservation_cleanup", {
        p_reservation_id: reservation.id,
        p_result: "failed",
      });
      reservationsFailed++;
    }
  }

  let warnings: unknown[] = [];
  if (entitlementChecksSucceeded) {
    const { data, error } = await admin.rpc("claim_pipelab_cloud_deletion_warnings");
    if (error) throw error;
    warnings = data ?? [];
  }
  let emailsSent = 0;
  let emailsFailed = 0;
  for (const warning of warnings as Array<{
    user_id: string;
    email: string | null;
    deadline_at: string;
  }>) {
    let acknowledged = false;
    try {
      if (!warning.email || !env.RESEND_API_KEY || !env.PIPELAB_CLOUD_FROM_EMAIL) {
        emailsFailed++;
        continue;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.PIPELAB_CLOUD_FROM_EMAIL,
          to: [warning.email],
          subject: "Your Pipelab Cloud artifacts are scheduled for deletion",
          text: `Your Pipelab Cloud artifacts and share links will be deleted after ${new Date(warning.deadline_at).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "long" })}. Renew your plan to keep using Pipelab Cloud or download your artifacts before the deadline.`,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        emailsFailed++;
        continue;
      }
      const { error: acknowledgeError } = await admin.rpc(
        "complete_pipelab_cloud_deletion_warning",
        { p_user_id: warning.user_id },
      );
      if (acknowledgeError) throw acknowledgeError;
      acknowledged = true;
      emailsSent++;
    } catch {
      emailsFailed++;
    } finally {
      if (!acknowledged) {
        const { error: releaseError } = await admin.rpc("release_pipelab_cloud_deletion_warning", {
          p_user_id: warning.user_id,
        });
        if (releaseError) throw releaseError;
      }
    }
  }

  const { data: artifacts, error: claimError } = await admin.rpc(
    "claim_expired_pipelab_cloud_artifacts",
    { p_limit: 100, p_verified_user_ids: verifiedUserIds },
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

  console.log("Pipelab Cloud cleanup completed", {
    deleted,
    failed,
    reservationsDeleted,
    reservationsFailed,
    emailsSent,
    emailsFailed,
  });
  return { deleted, failed, reservationsDeleted, reservationsFailed, emailsSent, emailsFailed };
}

export async function handleScheduled(_controller: unknown, env: Env, context: ExecutionContext) {
  context.waitUntil(cleanupExpiredArtifacts(env));
}

export default {
  fetch: handleRequest,
  scheduled: handleScheduled,
};
