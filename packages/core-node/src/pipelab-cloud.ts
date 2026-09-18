import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supabase } from "@pipelab/shared";
import type { WorkflowTask } from "@pipelab/workflow-runtime";
import type { PipelabContext } from "./context";
import { JsonFileStorage } from "./utils/storage";
import { zipFolder } from "./utils/fs-extras";

type PreparedUpload = {
  storageKey: string;
} & (
  | { uploadUrl: string; headers: Record<string, string> }
  | { multipart: true; uploadId: string; partSize: number }
);

const hashFile = async (path: string, signal: AbortSignal) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk as Buffer);
  return hash.digest("hex");
};

const readPreparedUpload = (value: unknown): PreparedUpload => {
  if (!value || typeof value !== "object")
    throw new Error("Pipelab Cloud returned an invalid upload response");
  const data = value as Record<string, unknown>;
  if (typeof data.storageKey !== "string")
    throw new Error("Pipelab Cloud returned an invalid upload response");

  if (data.multipart === true) {
    if (
      typeof data.uploadId !== "string" ||
      !Number.isSafeInteger(data.partSize) ||
      Number(data.partSize) <= 0
    ) {
      throw new Error("Pipelab Cloud returned an invalid multipart upload response");
    }
    return {
      storageKey: data.storageKey,
      uploadId: data.uploadId,
      partSize: Number(data.partSize),
      multipart: true,
    };
  }

  if (
    typeof data.uploadUrl !== "string" ||
    !data.headers ||
    typeof data.headers !== "object" ||
    Array.isArray(data.headers)
  ) {
    throw new Error("Pipelab Cloud returned an invalid upload response");
  }

  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(data.headers)) {
    if (typeof headerValue !== "string")
      throw new Error("Pipelab Cloud returned invalid upload headers");
    headers[key] = headerValue;
  }
  return { uploadUrl: data.uploadUrl, storageKey: data.storageKey, headers };
};

const getCloudWorkerUrl = () => {
  const configuredUrl = process.env.PIPELAB_CLOUD_WORKER_URL;
  if (!configuredUrl) throw new Error("Pipelab Cloud is not configured");

  const url = new URL(configuredUrl);
  const isLocalHttp =
    url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Pipelab Cloud Worker URL must be an HTTPS origin");
  }
  return url.origin;
};

const invokeCloudWorker = async (
  workerUrl: string,
  accessToken: string,
  body: Record<string, unknown>,
) => {
  const response = await fetch(`${workerUrl}/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Pipelab Cloud request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
};

export const createPipelabCloudUploadTask =
  (context: PipelabContext): WorkflowTask =>
  async ({ delivery, log, signal }) => {
    const artifact = delivery?.artifact;
    if (!artifact) {
      throw new Error("Pipelab Cloud upload requires a resolved workflow delivery artifact");
    }
    const { id: artifactId, outputId: artifactOutputId, version, path: sourcePath } = artifact;
    if (!sourcePath || !artifactId || !artifactOutputId || !version) {
      throw new Error("Pipelab Cloud upload received incomplete artifact metadata");
    }

    const client = supabase({
      auth: {
        storage: new JsonFileStorage("auth-session.json", context),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    if (!client) throw new Error("Pipelab Cloud requires Supabase to be configured");
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();
    if (sessionError || !session || session.user.is_anonymous || !session.access_token) {
      throw new Error("Sign in to your Pipelab account to upload artifacts to Pipelab Cloud");
    }
    const cloudWorkerUrl = getCloudWorkerUrl();

    let uploadPath = sourcePath;
    let temporaryDirectory: string | undefined;
    try {
      const sourceStats = await stat(sourcePath);
      if (sourceStats.isDirectory()) {
        temporaryDirectory = await mkdtemp(join(tmpdir(), "pipelab-cloud-upload-"));
        uploadPath = join(temporaryDirectory, "artifact.zip");
        await zipFolder(sourcePath, uploadPath, log, signal);
      } else if (!sourceStats.isFile()) {
        throw new Error("Pipelab Cloud can only upload files and folders");
      }

      const { size } = await stat(uploadPath);
      const checksum = await hashFile(uploadPath, signal);
      log(`Preparing ${artifactOutputId} for Pipelab Cloud (${size} bytes)`);

      const prepareData = await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
        action: "prepareUpload",
        artifactId,
        artifactOutputId,
        version,
        size,
        checksum,
      });
      const prepared = readPreparedUpload(prepareData);

      log(`Uploading ${artifactOutputId} to Pipelab Cloud`);
      let multipartParts: Array<{ PartNumber: number; ETag: string }> | undefined;
      if ("uploadUrl" in prepared) {
        const uploadResponse = await fetch(prepared.uploadUrl, {
          method: "PUT",
          headers: { ...prepared.headers, "content-length": String(size) },
          body: createReadStream(uploadPath, { signal }),
          signal,
          duplex: "half",
        } as unknown as RequestInit & { duplex: "half" });
        if (!uploadResponse.ok) {
          const detail = (await uploadResponse.text()).slice(0, 500);
          throw new Error(`Pipelab Cloud upload failed (${uploadResponse.status}): ${detail}`);
        }
      } else {
        const partCount = Math.ceil(size / prepared.partSize);
        multipartParts = [];
        try {
          for (let firstPart = 1; firstPart <= partCount; firstPart += 4) {
            const partNumbers = Array.from(
              { length: Math.min(4, partCount - firstPart + 1) },
              (_, offset) => firstPart + offset,
            );
            const signedData = await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
              action: "signParts",
              storageKey: prepared.storageKey,
              uploadId: prepared.uploadId,
              partNumbers,
            });
            const signedParts = (signedData as { parts?: unknown } | null)?.parts;
            if (!Array.isArray(signedParts) || signedParts.length !== partNumbers.length) {
              throw new Error("Pipelab Cloud returned invalid multipart upload URLs");
            }

            const uploadedParts = await Promise.all(
              signedParts.map(async (entry, index) => {
                if (!entry || typeof entry !== "object")
                  throw new Error("Pipelab Cloud returned invalid multipart upload URLs");
                const signed = entry as { partNumber?: unknown; url?: unknown };
                const partNumber = partNumbers[index];
                if (signed.partNumber !== partNumber || typeof signed.url !== "string") {
                  throw new Error("Pipelab Cloud returned invalid multipart upload URLs");
                }
                const start = (partNumber - 1) * prepared.partSize;
                const end = Math.min(start + prepared.partSize, size) - 1;
                const partLength = end - start + 1;
                const response = await fetch(signed.url, {
                  method: "PUT",
                  headers: { "content-length": String(partLength) },
                  body: createReadStream(uploadPath, { start, end, signal }),
                  signal,
                  duplex: "half",
                } as unknown as RequestInit & { duplex: "half" });
                if (!response.ok)
                  throw new Error(`Pipelab Cloud part ${partNumber} failed (${response.status})`);
                const etag = response.headers.get("etag");
                if (!etag)
                  throw new Error(`Pipelab Cloud part ${partNumber} did not return an ETag`);
                return { PartNumber: partNumber, ETag: etag };
              }),
            );
            multipartParts.push(...uploadedParts);
            log(`Uploaded ${multipartParts.length} of ${partCount} Pipelab Cloud parts`);
          }
        } catch (error) {
          await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
            action: "abortUpload",
            storageKey: prepared.storageKey,
            uploadId: prepared.uploadId,
          }).catch(() => undefined);
          throw error;
        }
      }

      let completionData: unknown;
      try {
        completionData = await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
          action: "completeUpload",
          artifactId,
          artifactOutputId,
          version,
          size,
          checksum,
          storageKey: prepared.storageKey,
          ...(multipartParts
            ? {
                uploadId: (prepared as Extract<PreparedUpload, { multipart: true }>).uploadId,
                parts: multipartParts,
              }
            : {}),
        });
      } catch (completionError) {
        if ("multipart" in prepared) {
          await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
            action: "abortUpload",
            storageKey: prepared.storageKey,
            uploadId: prepared.uploadId,
          }).catch(() => undefined);
        }
        const message =
          completionError instanceof Error
            ? completionError.message
            : "Could not save Pipelab Cloud metadata";
        throw new Error(message);
      }
      const artifact = (completionData as { artifact?: { expires_at?: string } } | null)?.artifact;
      log(`${artifactOutputId} uploaded and pinned as the latest artifact for this output`);

      return {
        artifactId,
        artifactOutputId,
        size,
        checksum,
        storageKey: prepared.storageKey,
        expiresAt: artifact?.expires_at,
        pinned: true,
      };
    } finally {
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    }
  };
