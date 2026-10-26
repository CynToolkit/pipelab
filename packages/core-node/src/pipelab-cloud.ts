import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { WorkflowArtifactInstance, WorkflowTask } from "@pipelab/workflow-runtime";
import type { PipelabContext } from "./context";
import type { ProviderServices } from "./workflow-tasks";
import { createPipelabCloudAuthClient } from "./pipelab-cloud-auth";
import { zipFolder } from "./utils/fs-extras";

type PreparedUpload = {
  reservationId: string;
} & (
  | { uploadUrl: string; headers: Record<string, string> }
  | { multipart: true; uploadId: string; partSize: number }
);

export const createCloudArtifactUploadMetadata = (
  artifact: Pick<WorkflowArtifactInstance, "id" | "artifact"> & {
    version: string;
    originalName: string;
    artifactKind: "file" | "directory";
  },
  identity: { projectId: string; buildProfileId: string; buildTargetId: string },
  size: number,
  checksum: string,
) => ({
  artifactId: artifact.id,
  artifactOutputId: artifact.artifact,
  version: artifact.version,
  originalName: artifact.originalName,
  artifactKind: artifact.artifactKind,
  ...identity,
  size,
  checksum,
});

export const hashPipelabCloudArtifact = async (
  path: string,
  signal: AbortSignal,
  partSize?: number,
) => {
  if (partSize !== undefined && (!Number.isSafeInteger(partSize) || partSize < 1)) {
    throw new Error("Pipelab Cloud returned an invalid multipart upload part size");
  }
  const sha256 = createHash("sha256");
  const contentMd5 = createHash("md5");
  const partChecksums: string[] = [];
  let partMd5 = partSize === undefined ? undefined : createHash("md5");
  let bytesInPart = 0;

  for await (const chunk of createReadStream(path, { signal })) {
    const bytes = chunk as Buffer;
    sha256.update(bytes);
    contentMd5.update(bytes);

    if (partSize === undefined || !partMd5) continue;
    let offset = 0;
    while (offset < bytes.length) {
      const length = Math.min(partSize - bytesInPart, bytes.length - offset);
      partMd5.update(bytes.subarray(offset, offset + length));
      bytesInPart += length;
      offset += length;
      if (bytesInPart === partSize) {
        partChecksums.push(partMd5.digest("base64"));
        partMd5 = createHash("md5");
        bytesInPart = 0;
      }
    }
  }

  if (partMd5 && bytesInPart > 0) partChecksums.push(partMd5.digest("base64"));
  return {
    checksum: sha256.digest("hex"),
    contentMd5: contentMd5.digest("base64"),
    partChecksums,
  };
};

const multipartPartSizeFor = (size: number) => {
  const mib = 1024 * 1024;
  return Math.ceil(Math.max(64 * mib, size / 10_000) / mib) * mib;
};

const readPreparedUpload = (value: unknown): PreparedUpload => {
  if (!value || typeof value !== "object")
    throw new Error("Pipelab Cloud returned an invalid upload response");
  const data = value as Record<string, unknown>;
  if (typeof data.reservationId !== "string" || !/^[0-9a-f-]{36}$/i.test(data.reservationId))
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
      reservationId: data.reservationId,
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
  return {
    uploadUrl: data.uploadUrl,
    reservationId: data.reservationId,
    headers,
  };
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

export const getPipelabCloudDownloadUrl = async (
  context: PipelabContext,
  hostedArtifactId: string,
) => {
  const client = createPipelabCloudAuthClient(context);
  if (!client) throw new Error("Pipelab Cloud is not configured");
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || !session?.access_token || session.user.is_anonymous)
    throw new Error("Sign in to your Pipelab account to download hosted artifacts");
  const response = await invokeCloudWorker(getCloudWorkerUrl(), session.access_token, {
    action: "getArtifactDownloadUrl",
    hostedArtifactId,
  });
  const url = (response as { downloadUrl?: unknown } | null)?.downloadUrl;
  if (typeof url !== "string") throw new Error("Pipelab Cloud returned an invalid download URL");
  return url;
};

export const createPipelabCloudUploadTask =
  (services: ProviderServices): WorkflowTask =>
  async ({ delivery, log, signal, step }) => {
    const artifact = delivery?.artifact;
    if (!artifact) {
      throw new Error("Pipelab Cloud upload requires a resolved workflow delivery artifact");
    }
    const { id: artifactId, artifact: artifactName, version, path: sourcePath } = artifact;
    if (!sourcePath || !artifactId || !artifactName || !version) {
      throw new Error("Pipelab Cloud upload received incomplete artifact metadata");
    }
    const buildProfileId = step.with?.buildProfileId;
    const buildTargetId = step.with?.buildTargetId;
    if (typeof buildProfileId !== "string" || typeof buildTargetId !== "string") {
      throw new Error("Pipelab Cloud upload requires stable Build Profile and target IDs");
    }
    const identity = {
      projectId: services.run.projectId,
      buildProfileId,
      buildTargetId,
    };

    const client = createPipelabCloudAuthClient(services.context);
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
      const artifactKind = sourceStats.isDirectory() ? "directory" : "file";
      if (sourceStats.isDirectory()) {
        temporaryDirectory = await mkdtemp(join(tmpdir(), "pipelab-cloud-upload-"));
        uploadPath = join(temporaryDirectory, "artifact.zip");
        await zipFolder(sourcePath, uploadPath, log, signal);
      } else if (!sourceStats.isFile()) {
        throw new Error("Pipelab Cloud can only upload files and folders");
      }

      const { size } = await stat(uploadPath);
      const multipartPartSize = size > 5 * 1024 ** 3 ? multipartPartSizeFor(size) : undefined;
      const checksums = await hashPipelabCloudArtifact(uploadPath, signal, multipartPartSize);
      const uploadMetadata = createCloudArtifactUploadMetadata(
        {
          id: artifactId,
          artifact: artifactName,
          version,
          originalName: basename(sourcePath),
          artifactKind,
        },
        identity,
        size,
        checksums.checksum,
      );
      log(`Preparing ${artifactName} for Pipelab Cloud (${size} bytes)`);

      const prepareData = await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
        action: "prepareUpload",
        ...uploadMetadata,
        contentMd5: checksums.contentMd5,
        ...(multipartPartSize === undefined ? {} : { partSize: multipartPartSize }),
      });
      const prepared = readPreparedUpload(prepareData);
      const preparedAsMultipart = "multipart" in prepared;
      if (
        preparedAsMultipart !== (multipartPartSize !== undefined) ||
        (preparedAsMultipart && prepared.partSize !== multipartPartSize)
      ) {
        await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
          action: "abortUpload",
          reservationId: prepared.reservationId,
        }).catch((): undefined => undefined);
        throw new Error("Pipelab Cloud returned an unexpected multipart part size");
      }

      log(`Uploading ${artifactName} to Pipelab Cloud`);
      let multipartParts: Array<{ PartNumber: number; ETag: string }> | undefined;
      if ("uploadUrl" in prepared) {
        try {
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
        } catch (error) {
          await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
            action: "abortUpload",
            reservationId: prepared.reservationId,
          }).catch((): undefined => undefined);
          throw error;
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
              reservationId: prepared.reservationId,
              partNumbers,
              partChecksums: partNumbers.map((partNumber) => {
                const contentMd5 = checksums.partChecksums[partNumber - 1];
                if (!contentMd5) throw new Error("Pipelab Cloud part checksum is missing");
                return { partNumber, contentMd5 };
              }),
            });
            const signedParts = (signedData as { parts?: unknown } | null)?.parts;
            if (!Array.isArray(signedParts) || signedParts.length !== partNumbers.length) {
              throw new Error("Pipelab Cloud returned invalid multipart upload URLs");
            }

            const uploadedParts = await Promise.all(
              signedParts.map(async (entry, index) => {
                if (!entry || typeof entry !== "object")
                  throw new Error("Pipelab Cloud returned invalid multipart upload URLs");
                const signed = entry as {
                  partNumber?: unknown;
                  url?: unknown;
                  headers?: unknown;
                };
                const partNumber = partNumbers[index];
                const expectedMd5 = checksums.partChecksums[partNumber - 1];
                if (
                  signed.partNumber !== partNumber ||
                  typeof signed.url !== "string" ||
                  !signed.headers ||
                  typeof signed.headers !== "object" ||
                  Array.isArray(signed.headers) ||
                  (signed.headers as Record<string, unknown>)["content-md5"] !== expectedMd5
                ) {
                  throw new Error("Pipelab Cloud returned invalid multipart upload URLs");
                }
                const start = (partNumber - 1) * prepared.partSize;
                const end = Math.min(start + prepared.partSize, size) - 1;
                const partLength = end - start + 1;
                const response = await fetch(signed.url, {
                  method: "PUT",
                  headers: {
                    ...(signed.headers as Record<string, string>),
                    "content-length": String(partLength),
                  },
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
            reservationId: prepared.reservationId,
          }).catch((): undefined => undefined);
          throw error;
        }
      }

      let completionData: unknown;
      try {
        completionData = await invokeCloudWorker(cloudWorkerUrl, session.access_token, {
          action: "completeUpload",
          reservationId: prepared.reservationId,
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
            reservationId: prepared.reservationId,
          }).catch((): undefined => undefined);
        }
        const message =
          completionError instanceof Error
            ? completionError.message
            : "Could not save Pipelab Cloud metadata";
        throw new Error(message);
      }
      const uploaded = (
        completionData as { artifact?: { id?: string; uploaded_at?: string } } | null
      )?.artifact;
      if (
        typeof uploaded?.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          uploaded.id,
        )
      ) {
        throw new Error("Pipelab Cloud did not return a valid hosted artifact ID");
      }
      if (
        typeof uploaded.uploaded_at !== "string" ||
        !Number.isFinite(Date.parse(uploaded.uploaded_at))
      ) {
        throw new Error("Pipelab Cloud did not return a valid upload timestamp");
      }
      log(`${artifactName} uploaded to Pipelab Cloud`);

      return {
        artifactId,
        artifactName,
        size,
        checksum: checksums.checksum,
        cloud: {
          hostedArtifactId: uploaded.id,
          uploadedAt: uploaded.uploaded_at,
        },
      };
    } finally {
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    }
  };
