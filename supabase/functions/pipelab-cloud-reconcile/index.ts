import { getPolarAccessToken, getPolarEndpoints } from "../_shared/polar-config.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PlanLimit = {
  product_id: string;
  quota_bytes: string | number;
  history_retention_days: number;
};

type Subscription = {
  status?: unknown;
  current_period_end?: unknown;
  product?: { id?: unknown };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function bearerMatches(request: Request, expected: string) {
  const prefix = "Bearer ";
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith(prefix)) return false;
  const actual = new TextEncoder().encode(authorization.slice(prefix.length));
  const secret = new TextEncoder().encode(expected);
  if (actual.length !== secret.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) {
    difference |= actual[index] ^ secret[index];
  }
  return difference === 0;
}

async function supabaseRequest(
  baseUrl: string,
  serviceRoleKey: string,
  path: string,
  init: RequestInit = {},
) {
  return fetch(new URL(`/rest/v1/${path}`, baseUrl), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

async function planForProduct(
  baseUrl: string,
  serviceRoleKey: string,
  productId: string,
): Promise<PlanLimit | null> {
  const query = new URLSearchParams({
    select: "product_id,quota_bytes,history_retention_days",
    product_id: `eq.${productId}`,
    enabled: "eq.true",
    limit: "1",
  });
  const response = await supabaseRequest(
    baseUrl,
    serviceRoleKey,
    `pipelab_cloud_plan_limits?${query}`,
  );
  if (!response.ok) throw new Error("Could not read Pipelab Cloud plan limits");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  const plan = rows[0] as Partial<PlanLimit>;
  const quota = BigInt(String(plan.quota_bytes ?? "0"));
  if (
    typeof plan.product_id !== "string" ||
    quota <= 0n ||
    !Number.isInteger(plan.history_retention_days) ||
    Number(plan.history_retention_days) < 1 ||
    Number(plan.history_retention_days) > 3650
  ) {
    return null;
  }
  return {
    product_id: plan.product_id,
    quota_bytes: quota.toString(),
    history_retention_days: Number(plan.history_retention_days),
  };
}

async function setEntitlement(
  baseUrl: string,
  serviceRoleKey: string,
  rpc: "set_pipelab_cloud_active_entitlement" | "set_pipelab_cloud_expired_entitlement",
  userId: string,
  plan: PlanLimit,
  paidThroughAt: string,
) {
  const response = await supabaseRequest(baseUrl, serviceRoleKey, `rpc/${rpc}`, {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_plan_product_id: plan.product_id,
      p_quota_bytes: plan.quota_bytes,
      p_retention_days: plan.history_retention_days,
      p_paid_through_at: paidThroughAt,
    }),
  });
  if (!response.ok) {
    throw new Error("Could not update Pipelab Cloud entitlement state");
  }
}

async function reconcileUser(
  userId: string,
  baseUrl: string,
  serviceRoleKey: string,
  polarToken: string,
  organizationId: string,
  polarApiBaseUrl: string,
) {
  const subscriptionsUrl = new URL(`${polarApiBaseUrl}/subscriptions/`);
  subscriptionsUrl.searchParams.set("organization_id", organizationId);
  subscriptionsUrl.searchParams.set("external_customer_id", userId);
  subscriptionsUrl.searchParams.set("limit", "100");
  const response = await fetch(subscriptionsUrl, {
    headers: {
      Authorization: `Bearer ${polarToken}`,
      Accept: "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error("Pipelab Cloud billing reconciliation failed");
  }
  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("items" in payload) ||
    !Array.isArray(payload.items)
  ) {
    throw new Error("Pipelab Cloud billing response is invalid");
  }

  const active: Array<{ plan: PlanLimit; paidThroughAt: string }> = [];
  const expired: Array<{ plan: PlanLimit; paidThroughAt: string }> = [];
  const limits = new Map<string, PlanLimit | null>();
  for (const item of payload.items as Subscription[]) {
    const productId = item?.product?.id;
    const paidThroughAt = item?.current_period_end;
    if (
      typeof productId !== "string" ||
      (item.status !== "active" && item.status !== "canceled") ||
      typeof paidThroughAt !== "string" ||
      !Number.isFinite(Date.parse(paidThroughAt))
    ) {
      continue;
    }
    if (!limits.has(productId)) {
      limits.set(productId, await planForProduct(baseUrl, serviceRoleKey, productId));
    }
    const plan = limits.get(productId);
    if (!plan) continue;
    const candidate = { plan, paidThroughAt };
    if (item.status === "active" && Date.parse(paidThroughAt) > Date.now()) {
      active.push(candidate);
    } else if (item.status === "canceled") expired.push(candidate);
  }

  const byQuota = (left: (typeof active)[number], right: (typeof active)[number]) =>
    Number(BigInt(right.plan.quota_bytes) - BigInt(left.plan.quota_bytes));
  active.sort(byQuota);
  if (active.length) {
    await setEntitlement(
      baseUrl,
      serviceRoleKey,
      "set_pipelab_cloud_active_entitlement",
      userId,
      active[0].plan,
      active[0].paidThroughAt,
    );
    return;
  }
  expired.sort((left, right) => Date.parse(right.paidThroughAt) - Date.parse(left.paidThroughAt));
  if (expired.length) {
    await setEntitlement(
      baseUrl,
      serviceRoleKey,
      "set_pipelab_cloud_expired_entitlement",
      userId,
      expired[0].plan,
      expired[0].paidThroughAt,
    );
  }
}

export function createReconcileHandler(env: (name: string) => string | undefined) {
  return async (request: Request) => {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) return json({ error: "service_unavailable" }, 503);
    if (!bearerMatches(request, serviceRoleKey)) {
      return json({ error: "unauthorized" }, 401);
    }

    const baseUrl = env("SUPABASE_URL");
    const polarToken = getPolarAccessToken(env);
    const organizationId = env("POLAR_ORGANIZATION_ID");
    const endpoints = getPolarEndpoints(env);
    if (!baseUrl || !polarToken || !organizationId || !endpoints) {
      return json({ error: "service_unavailable" }, 503);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("userIds" in body) ||
      !Array.isArray(body.userIds) ||
      body.userIds.length > 100 ||
      !body.userIds.every((id) => typeof id === "string" && uuidPattern.test(id))
    ) {
      return json({ error: "invalid_request" }, 400);
    }

    try {
      for (const userId of [...new Set(body.userIds as string[])]) {
        await reconcileUser(
          userId,
          baseUrl,
          serviceRoleKey,
          polarToken,
          organizationId,
          endpoints.apiBaseUrl,
        );
      }
      return json({ reconciled: body.userIds.length });
    } catch {
      return json({ error: "reconciliation_failed" }, 503);
    }
  };
}

if (import.meta.main) {
  Deno.serve(createReconcileHandler((name) => Deno.env.get(name)));
}
