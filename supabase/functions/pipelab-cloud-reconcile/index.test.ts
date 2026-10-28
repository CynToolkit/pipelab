import { createReconcileHandler } from "./index.ts";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const values: Record<string, string | undefined> = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  POLAR_ACCESS_TOKEN: "polar-token",
  POLAR_ORGANIZATION_ID: "organization-id",
  POLAR_API_BASE_URL: "http://127.0.0.1:8787/v1",
  POLAR_FRONTEND_BASE_URL: "http://127.0.0.1:8788",
  POLAR_CHECKOUT_LINK_BASE_URL: "http://127.0.0.1:8789",
};
const env = (name: string) => values[name];
Deno.test("reconciles an active paid subscription into account state", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("http://127.0.0.1:8787/v1/subscriptions/")) {
      return Response.json({
        items: [
          {
            status: "active",
            current_period_end: "2099-01-01T00:00:00.000Z",
            product: { id: "product-basic" },
          },
        ],
      });
    }
    if (url.includes("pipelab_cloud_plan_limits")) {
      return Response.json([
        {
          product_id: "product-basic",
          quota_bytes: "12800000000",
          history_retention_days: 30,
        },
      ]);
    }
    if (url.endsWith("/rpc/set_pipelab_cloud_active_entitlement")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const handler = createReconcileHandler(env);
    const response = await handler(
      new Request("http://worker/functions/pipelab-cloud-reconcile", {
        method: "POST",
        headers: {
          Authorization: "Bearer service-role-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: [userId] }),
      }),
    );
    if (response.status !== 200) {
      throw new Error(`Unexpected response ${response.status}`);
    }
    if (!calls.some((call) => call.url.endsWith("/rpc/set_pipelab_cloud_active_entitlement"))) {
      throw new Error("Active entitlement RPC was not called");
    }
    if (!calls[0]?.url.startsWith("http://127.0.0.1:8787/v1/subscriptions/")) {
      throw new Error("The configured Polar API endpoint was not used");
    }
    const rpcCall = calls.find((call) =>
      call.url.endsWith("/rpc/set_pipelab_cloud_active_entitlement"),
    );
    const rpcBody = JSON.parse(String(rpcCall?.init?.body));
    if (rpcBody.p_user_id !== userId || rpcBody.p_quota_bytes !== "12800000000") {
      throw new Error("The account and configured quota were not passed to the entitlement RPC");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("rejects requests without the Worker service-role bearer", async () => {
  const handler = createReconcileHandler(env);
  const response = await handler(
    new Request("http://worker/functions/pipelab-cloud-reconcile", {
      method: "POST",
      headers: {
        Authorization: "Bearer user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userIds: [userId] }),
    }),
  );
  if (response.status !== 401) {
    throw new Error(`Expected 401, received ${response.status}`);
  }
});

Deno.test("requires Polar endpoint settings before reconciliation requests", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ items: [] });
  };

  try {
    const handler = createReconcileHandler((name) =>
      name === "POLAR_API_BASE_URL" ? undefined : env(name)
    );
    const response = await handler(
      new Request("http://worker/functions/pipelab-cloud-reconcile", {
        method: "POST",
        headers: {
          Authorization: "Bearer service-role-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: [userId] }),
      }),
    );
    if (response.status !== 503) {
      throw new Error(`Expected 503, received ${response.status}`);
    }
    if (calls !== 0) {
      throw new Error("Fetch was called without the required Polar endpoint settings");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
