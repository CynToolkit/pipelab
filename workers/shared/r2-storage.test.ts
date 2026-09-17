import { getR2StorageConfig, matchesObjectMetadata } from "./r2-storage.ts";

function assertEquals<T>(actual: T, expected: T) {
  const normalize = (value: unknown): unknown =>
    value && typeof value === "object"
      ? Array.isArray(value) ? value.map(normalize) : Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          left.localeCompare(right)
        ).map(
          ([key, nested]) => [key, normalize(nested)],
        ),
      )
      : value;
  if (
    JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))
  ) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("development resolves its S3 endpoint without real R2 credentials", () => {
  const config = getR2StorageConfig((name) =>
    name === "R2_ENDPOINT_URL" ? "http://host.docker.internal:8787" : undefined
  );

  assertEquals(config, {
    endpoint: "http://host.docker.internal:8787",
    accessKeyId: "local",
    secretAccessKey: "local",
    bucket: "pipelab-cloud-local",
    local: true,
  });
});

Deno.test("production keeps the existing Cloudflare R2 endpoint and credentials", () => {
  const config = getR2StorageConfig((name) =>
    ({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "bucket",
    })[name]
  );

  assertEquals(config, {
    endpoint: "https://account.r2.cloudflarestorage.com",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucket: "bucket",
    local: false,
  });
});

Deno.test("production storage still rejects missing R2 credentials", () => {
  let threw = false;
  try {
    getR2StorageConfig(() => undefined);
  } catch (error) {
    threw = error instanceof Error &&
      error.message === "Pipelab Cloud storage is not configured";
  }
  if (!threw) {
    throw new Error(
      "Expected missing production R2 credentials to be rejected",
    );
  }
});

Deno.test("storage endpoint rejects credentials, paths, and non-HTTP schemes", () => {
  for (
    const endpoint of [
      "ftp://localhost:8787",
      "http://user:pass@localhost:8787",
      "http://localhost:8787/prefix",
    ]
  ) {
    let threw = false;
    try {
      getR2StorageConfig((name) =>
        name === "R2_ENDPOINT_URL" ? endpoint : undefined
      );
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(`Expected invalid endpoint to be rejected: ${endpoint}`);
    }
  }
});

Deno.test("shared HEAD verification rejects objects with a different size or metadata", () => {
  const object = {
    ContentLength: 42,
    Metadata: {
      ownerid: "user-1",
      artifactid: "artifact-1",
      artifactoutputid: "electron.windows",
      version: "1.0.0",
      checksum: "abc",
    },
  };
  const expected = { ...object.Metadata };

  assertEquals(matchesObjectMetadata(object, 42, expected), true);
  assertEquals(matchesObjectMetadata(object, 43, expected), false);
  assertEquals(
    matchesObjectMetadata(object, 42, { ...expected, checksum: "wrong" }),
    false,
  );
});
