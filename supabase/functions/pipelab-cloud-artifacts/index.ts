import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "https://esm.sh/@aws-sdk/client-s3@3.821.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.821.0";

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getR2 = () => {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET_NAME");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Pipelab Cloud storage is not configured");
  }
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Sign in to Pipelab Cloud before uploading" }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? publishableKeys.default ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretKeys.default ?? "";
    if (!url || !anonKey || !serviceRoleKey) throw new Error("Supabase function keys are not configured");
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user || user.is_anonymous) {
      return json({ error: "A signed-in Pipelab account is required" }, 401);
    }

    const body = await request.json();
    const { bucket, client } = getR2();
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.action === "prepareUpload") {
      const { artifactId, artifactOutputId, version, size, checksum } = body;
      if (
        typeof artifactId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(artifactId) ||
        typeof artifactOutputId !== "string" || !outputIds.has(artifactOutputId) ||
        typeof version !== "string" || version.length < 1 || version.length > 128 ||
        !Number.isSafeInteger(size) || size < 0 || size > 5 * 1024 * 1024 * 1024 * 1024 ||
        typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum)
      ) return json({ error: "Invalid artifact upload metadata" }, 422);

      const storageKey = `${user.id}/${artifactOutputId}/${crypto.randomUUID()}.zip`;
      const metadata = {
        artifactid: artifactId,
        artifactoutputid: artifactOutputId,
        checksum,
        ownerid: user.id,
        version,
      };
      if (size <= 5 * 1024 * 1024 * 1024) {
        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          ContentType: "application/zip",
          Metadata: metadata,
        });
        // esm.sh currently resolves the presigner's Smithy types separately from
        // the S3 client. They are runtime-compatible; this cast avoids a false
        // nominal-type mismatch between those duplicated declarations.
        const uploadUrl = await getSignedUrl(client as never, command as never, { expiresIn: 900 });
        const headers = Object.fromEntries(
          Object.entries(metadata).map(([key, value]) => [`x-amz-meta-${key}`, value]),
        );
        headers["content-type"] = "application/zip";
        return json({ uploadUrl, storageKey, headers });
      }

      const started = await client.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: "application/zip",
        Metadata: metadata,
      }));
      if (!started.UploadId) throw new Error("Could not start multipart upload");
      const mib = 1024 * 1024;
      const partSize = Math.ceil(Math.max(64 * mib, size / 10_000) / mib) * mib;
      return json({ storageKey, uploadId: started.UploadId, partSize, multipart: true });
    }

    if (body.action === "signParts") {
      const { storageKey, uploadId, partNumbers } = body;
      if (
        typeof storageKey !== "string" || !storageKey.startsWith(`${user.id}/`) ||
        typeof uploadId !== "string" || uploadId.length > 1024 ||
        !Array.isArray(partNumbers) || partNumbers.length < 1 || partNumbers.length > 50 ||
        !partNumbers.every((part) => Number.isInteger(part) && part >= 1 && part <= 10_000)
      ) return json({ error: "Invalid multipart upload request" }, 422);
      await client.send(new ListPartsCommand({ Bucket: bucket, Key: storageKey, UploadId: uploadId }));
      const parts = await Promise.all(partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          client as never,
          new UploadPartCommand({ Bucket: bucket, Key: storageKey, UploadId: uploadId, PartNumber: partNumber }) as never,
          { expiresIn: 900 },
        ),
      })));
      return json({ parts });
    }

    if (body.action === "abortUpload") {
      const { storageKey, uploadId } = body;
      if (typeof storageKey !== "string" || !storageKey.startsWith(`${user.id}/`) || typeof uploadId !== "string") {
        return json({ error: "Invalid multipart upload request" }, 422);
      }
      await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: storageKey, UploadId: uploadId }));
      return json({ aborted: true });
    }

    if (body.action === "completeUpload") {
      const { artifactId, artifactOutputId, version, size, checksum, storageKey, uploadId, parts } = body;
      if (
        typeof artifactId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(artifactId) ||
        typeof artifactOutputId !== "string" || !outputIds.has(artifactOutputId) ||
        typeof version !== "string" || version.length < 1 || version.length > 128 ||
        !Number.isSafeInteger(size) || size < 0 ||
        typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum) ||
        typeof storageKey !== "string" || !storageKey.startsWith(`${user.id}/${artifactOutputId}/`)
      ) return json({ error: "Invalid artifact upload metadata" }, 422);

      if (uploadId !== undefined) {
        if (
          typeof uploadId !== "string" || !Array.isArray(parts) || parts.length < 1 || parts.length > 10_000 ||
          !parts.every((part) => Number.isInteger(part?.PartNumber) && part.PartNumber >= 1 && part.PartNumber <= 10_000 && typeof part.ETag === "string")
        ) return json({ error: "Invalid multipart completion request" }, 422);
        await client.send(new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: storageKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }));
      }

      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
      if (
        head.ContentLength !== size ||
        head.Metadata?.ownerid !== user.id ||
        head.Metadata?.artifactid !== artifactId ||
        head.Metadata?.artifactoutputid !== artifactOutputId ||
        head.Metadata?.version !== version ||
        head.Metadata?.checksum !== checksum
      ) return json({ error: "Uploaded object does not match its metadata" }, 422);

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
    console.error("Pipelab Cloud artifact request failed", error);
    return json({ error: "Pipelab Cloud could not complete the artifact request" }, 500);
  }
});
