import worker from "./worker.ts";

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

Deno.test("local R2 worker stores metadata, verifies it with HEAD, and deletes objects", async () => {
  const objects = new Map<
    string,
    { body: Uint8Array; contentType: string; metadata: Record<string, string> }
  >();
  const bucket = {
    async put(
      key: string,
      body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array,
      options: {
        httpMetadata?: { contentType?: string };
        customMetadata?: Record<string, string>;
      },
    ) {
      const bytes = body instanceof ReadableStream
        ? new Uint8Array(await new Response(body).arrayBuffer())
        : body instanceof Uint8Array
        ? body
        : new Uint8Array(body);
      objects.set(key, {
        body: bytes,
        contentType: options.httpMetadata?.contentType ??
          "application/octet-stream",
        metadata: options.customMetadata ?? {},
      });
    },
    head(key: string) {
      const object = objects.get(key);
      return Promise.resolve(object
        ? {
          size: object.body.byteLength,
          httpMetadata: { contentType: object.contentType },
          customMetadata: object.metadata,
        }
        : null);
    },
    delete(key: string) {
      objects.delete(key);
      return Promise.resolve();
    },
  };

  const key = "user/electron.windows/artifact.zip";
  const putResponse = await worker.fetch(
    new Request(`http://localhost:8787/pipelab-cloud-local/${key}`, {
      method: "PUT",
      headers: {
        "content-type": "application/zip",
        "x-amz-meta-ownerid": "user-1",
        "x-amz-meta-artifactid": "artifact-1",
      },
      body: "artifact bytes",
    }),
    { BUCKET: bucket, BUCKET_NAME: "pipelab-cloud-local" },
  );
  assertEquals(putResponse.status, 200);

  const headResponse = await worker.fetch(
    new Request(`http://localhost:8787/pipelab-cloud-local/${key}`, {
      method: "HEAD",
    }),
    { BUCKET: bucket, BUCKET_NAME: "pipelab-cloud-local" },
  );
  assertEquals(headResponse.status, 200);
  assertEquals(headResponse.headers.get("content-length"), "14");
  assertEquals(headResponse.headers.get("x-amz-meta-ownerid"), "user-1");
  assertEquals(headResponse.headers.get("x-amz-meta-artifactid"), "artifact-1");

  const deleteResponse = await worker.fetch(
    new Request(`http://localhost:8787/pipelab-cloud-local/${key}`, {
      method: "DELETE",
    }),
    { BUCKET: bucket, BUCKET_NAME: "pipelab-cloud-local" },
  );
  assertEquals(deleteResponse.status, 204);
  assertEquals(objects.has(key), false);
});

Deno.test("local R2 worker reports missing objects and missing keys", async () => {
  const bucket = {
    async put() {},
    head() {
      return Promise.resolve(null);
    },
    async delete() {},
  };
  const missingObject = await worker.fetch(
    new Request("http://localhost:8787/pipelab-cloud-local/missing", {
      method: "HEAD",
    }),
    { BUCKET: bucket, BUCKET_NAME: "pipelab-cloud-local" },
  );
  const missingKey = await worker.fetch(
    new Request("http://localhost:8787/pipelab-cloud-local/", {
      method: "DELETE",
    }),
    { BUCKET: bucket, BUCKET_NAME: "pipelab-cloud-local" },
  );

  assertEquals(missingObject.status, 404);
  assertEquals(missingKey.status, 400);
});
