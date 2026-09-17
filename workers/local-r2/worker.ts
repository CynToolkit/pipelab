interface R2ObjectMetadata {
  size: number;
  etag?: string;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  head(key: string): Promise<R2ObjectMetadata | null>;
  delete(key: string): Promise<void>;
}

interface Env {
  BUCKET: R2Bucket;
  BUCKET_NAME: string;
}

function response(status: number, headers?: HeadersInit): Response {
  return new Response(null, {
    status,
    headers,
  });
}

function getObjectKey(pathname: string, expectedBucket: string): string | null {
  try {
    const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2 || parts[0] !== expectedBucket) return null;
    return parts.slice(1).join("/");
  } catch {
    return null;
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!["PUT", "HEAD", "DELETE"].includes(request.method)) {
    return response(405, { Allow: "PUT, HEAD, DELETE" });
  }

  const key = getObjectKey(new URL(request.url).pathname, env.BUCKET_NAME);
  if (!key || new TextEncoder().encode(key).byteLength > 1024) {
    return response(400);
  }

  if (request.method === "PUT") {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const size = Number(contentLength);
      if (!Number.isSafeInteger(size) || size < 0) return response(400);
      if (size > 5 * 1024 * 1024 * 1024) return response(413);
    }

    const customMetadata: Record<string, string> = {};
    for (const [name, value] of request.headers) {
      const prefix = "x-amz-meta-";
      if (name.startsWith(prefix)) {
        customMetadata[name.slice(prefix.length)] = value;
      }
    }
    const result = await env.BUCKET.put(key, request.body ?? new Uint8Array(), {
      httpMetadata: {
        contentType: request.headers.get("content-type") ??
          "application/octet-stream",
      },
      customMetadata,
    });
    const etag = result && typeof result === "object" && "etag" in result &&
        typeof result.etag === "string"
      ? result.etag
      : undefined;
    return response(
      200,
      etag ? { ETag: `"${etag.replaceAll('"', "")}"` } : undefined,
    );
  }

  if (request.method === "HEAD") {
    const object = await env.BUCKET.head(key);
    if (!object) return response(404);
    const headers = new Headers({
      "Content-Length": String(object.size),
      "Content-Type": object.httpMetadata?.contentType ??
        "application/octet-stream",
    });
    if (object.etag) {
      headers.set("ETag", `"${object.etag.replaceAll('"', "")}"`);
    }
    if (object.uploaded) {
      headers.set("Last-Modified", object.uploaded.toUTCString());
    }
    for (const [name, value] of Object.entries(object.customMetadata ?? {})) {
      headers.set(`x-amz-meta-${name}`, value);
    }
    return response(200, headers);
  }

  await env.BUCKET.delete(key);
  return response(204);
}

export default { fetch: handleRequest };
