export type R2StorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  local: boolean;
};

export type R2HeadObject = {
  ContentLength: number;
  Metadata: Record<string, string>;
};

export function getR2StorageConfig(
  getEnv: (name: string) => string | undefined,
): R2StorageConfig {
  const configuredEndpoint = getEnv("R2_ENDPOINT_URL")?.trim().replace(
    /\/+$/,
    "",
  );
  const accountId = getEnv("R2_ACCOUNT_ID");
  const endpoint = configuredEndpoint ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint) throw new Error("Pipelab Cloud storage is not configured");

  const parsedEndpoint = new URL(endpoint);
  if (
    (parsedEndpoint.protocol !== "http:" &&
      parsedEndpoint.protocol !== "https:") ||
    parsedEndpoint.username || parsedEndpoint.password ||
    parsedEndpoint.search ||
    parsedEndpoint.hash || parsedEndpoint.pathname !== "/"
  ) {
    throw new Error(
      "R2_ENDPOINT_URL must be an HTTP(S) origin without credentials or a path",
    );
  }
  const local = parsedEndpoint.protocol === "http:";
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID") ??
    (local ? "local" : undefined);
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY") ??
    (local ? "local" : undefined);
  const bucket = getEnv("R2_BUCKET_NAME") ??
    (local ? "pipelab-cloud-local" : undefined);
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Pipelab Cloud storage is not configured");
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket, local };
}

export function matchesObjectMetadata(
  head: R2HeadObject,
  expectedSize: number,
  expectedMetadata: Record<string, string>,
): boolean {
  return head.ContentLength === expectedSize &&
    Object.entries(expectedMetadata).every(([name, value]) =>
      head.Metadata[name] === value
    );
}
