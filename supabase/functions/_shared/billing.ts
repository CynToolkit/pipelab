export type BillingOperation =
  | "polar-available-plans"
  | "polar-user-plan"
  | "customer-portal"
  | "checkout";
export type BillingUser = { id: string };

export type BillingDependencies = {
  env: (name: string) => string | undefined;
  fetcher: typeof fetch;
  resolveUser: (accessToken: string) => Promise<BillingUser | null>;
};

type PolarConfig = { token: string; organizationId: string };
type CorsContext = { allowed: boolean; origin?: string };

const POLAR_SANDBOX_API = "https://sandbox-api.polar.sh/v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_ORIGINS = ["http://127.0.0.1:5185", "http://localhost:5185"];
const LOCAL_SUPABASE_HOSTS = ["localhost", "127.0.0.1", "kong", "host.docker.internal"];
const REQUEST_TIMEOUT_MS = 8_000;

class BillingConfigurationError extends Error {}
class AuthenticationUnavailableError extends Error {}
class InvalidRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
class PolarApiError extends Error {
  constructor(readonly status: number) {
    super("Polar API request failed");
  }
}
class PolarPayloadError extends Error {}

export function createSupabaseUserResolver(
  env: BillingDependencies["env"],
  fetcher: typeof fetch,
): BillingDependencies["resolveUser"] {
  return async (accessToken) => {
    const supabaseUrl = env("SUPABASE_URL");
    const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !publishableKey) throw new BillingConfigurationError();

    let endpoint: URL;
    try {
      endpoint = new URL("/auth/v1/user", supabaseUrl);
    } catch {
      throw new BillingConfigurationError();
    }
    if (
      endpoint.protocol !== "https:" &&
      !(endpoint.protocol === "http:" && LOCAL_SUPABASE_HOSTS.includes(endpoint.hostname))
    ) {
      throw new BillingConfigurationError();
    }

    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: "GET",
        redirect: "error",
        headers: {
          apikey: publishableKey,
          Authorization: "Bearer " + accessToken,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AuthenticationUnavailableError();
    }

    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new AuthenticationUnavailableError();

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AuthenticationUnavailableError();
    }
    if (!isRecord(body) || typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) return null;
    return { id: body.id };
  };
}

export function createBillingHandler(
  operation: BillingOperation,
  dependencies: BillingDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const cors = getCorsContext(request, dependencies.env);
    if (!cors.allowed) {
      return jsonResponse(403, { error: "origin_not_allowed" });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(cors.origin),
      });
    }
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" }, cors.origin, {
        Allow: "POST, OPTIONS",
      });
    }

    try {
      let user: BillingUser | undefined;
      if (operation !== "polar-available-plans") {
        const token = bearerToken(request);
        if (!token) {
          return jsonResponse(401, { error: "unauthorized" }, cors.origin);
        }
        const resolvedUser = await dependencies.resolveUser(token);
        if (!resolvedUser) {
          return jsonResponse(401, { error: "unauthorized" }, cors.origin);
        }
        user = resolvedUser;
      }

      const config = polarConfig(dependencies.env);
      switch (operation) {
        case "polar-available-plans": {
          const products = await listProducts(config, dependencies.fetcher);
          return jsonResponse(
            200,
            {
              plans: products.map(mapProduct).filter(isDefined),
            },
            cors.origin,
          );
        }
        case "polar-user-plan": {
          if (!user) throw new BillingConfigurationError();
          const url = new URL(POLAR_SANDBOX_API + "/subscriptions/");
          url.searchParams.set("organization_id", config.organizationId);
          url.searchParams.set("external_customer_id", user.id);
          url.searchParams.set("limit", "100");
          const payload = await polarRequest(url, config, dependencies.fetcher);
          if (!isRecord(payload) || !Array.isArray(payload.items)) {
            throw new PolarPayloadError();
          }
          const subscriptions = payload.items.map((subscription) =>
            mapSubscription(subscription, user.id, config.organizationId),
          );
          if (subscriptions.some((subscription) => subscription === null)) {
            throw new PolarPayloadError();
          }
          return jsonResponse(200, { subscriptions }, cors.origin);
        }
        case "customer-portal": {
          if (!user) throw new BillingConfigurationError();
          const customer = await getCustomer(user.id, config, dependencies.fetcher);
          const sessionBody: Record<string, string> = {
            customer_id: customer.id,
          };
          const returnUrl = safeReturnUrl(cors.origin);
          if (returnUrl) sessionBody.return_url = returnUrl;
          const session = await polarRequest(
            new URL(POLAR_SANDBOX_API + "/customer-sessions/"),
            config,
            dependencies.fetcher,
            { method: "POST", body: JSON.stringify(sessionBody) },
          );
          if (
            !isRecord(session) ||
            typeof session.customer_portal_url !== "string" ||
            !isSandboxPolarUrl(session.customer_portal_url)
          )
            throw new PolarPayloadError();
          return jsonResponse(
            200,
            {
              customerPortal: session.customer_portal_url,
            },
            cors.origin,
          );
        }
        case "checkout": {
          if (!user) throw new BillingConfigurationError();
          const body = await requestJson(request);
          const itemIds = checkoutItemIds(body);
          const products = await listProducts(config, dependencies.fetcher);
          const validProductIds = new Set(products.map((product) => product.id));
          if (itemIds.some((id) => !validProductIds.has(id))) {
            throw new InvalidRequestError("invalid_products");
          }

          const requestBody: Record<string, unknown> = {
            products: itemIds,
            external_customer_id: user.id,
          };
          const returnUrl = safeReturnUrl(cors.origin);
          if (returnUrl) {
            requestBody.success_url = returnUrl + "?billing=success";
            requestBody.return_url = returnUrl;
          }
          const checkout = await polarRequest(
            new URL(POLAR_SANDBOX_API + "/checkouts/"),
            config,
            dependencies.fetcher,
            { method: "POST", body: JSON.stringify(requestBody) },
          );
          if (
            !isRecord(checkout) ||
            typeof checkout.url !== "string" ||
            !isSandboxCheckoutUrl(checkout.url)
          )
            throw new PolarPayloadError();
          return jsonResponse(200, { checkoutURL: checkout.url }, cors.origin);
        }
      }
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        return jsonResponse(400, { error: error.code }, cors.origin);
      }
      if (error instanceof BillingConfigurationError) {
        return jsonResponse(503, { error: "billing_unavailable" }, cors.origin);
      }
      if (error instanceof AuthenticationUnavailableError) {
        return jsonResponse(503, { error: "authentication_unavailable" }, cors.origin);
      }
      if (
        error instanceof PolarApiError &&
        operation === "customer-portal" &&
        error.status === 404
      ) {
        return jsonResponse(404, { error: "billing_customer_not_found" }, cors.origin);
      }
      if (error instanceof PolarApiError || error instanceof PolarPayloadError) {
        return jsonResponse(502, { error: "billing_provider_unavailable" }, cors.origin);
      }
      return jsonResponse(500, { error: "internal_error" }, cors.origin);
    }
  };
}

function polarConfig(env: BillingDependencies["env"]): PolarConfig {
  const token = env("POLAR_TOKEN")?.trim();
  const organizationId = env("POLAR_ORGANIZATION_ID")?.trim();
  if (!token || !organizationId || !UUID_PATTERN.test(organizationId)) {
    throw new BillingConfigurationError();
  }
  return { token, organizationId };
}

function getCorsContext(request: Request, env: BillingDependencies["env"]): CorsContext {
  const rawOrigin = request.headers.get("Origin");
  if (!rawOrigin) return { allowed: true };
  const origin = parseOrigin(rawOrigin);
  if (!origin || !allowedOrigins(env).has(origin)) return { allowed: false };
  return { allowed: true, origin };
}

function allowedOrigins(env: BillingDependencies["env"]): Set<string> {
  const configured = env("POLAR_ALLOWED_ORIGINS");
  const origins =
    configured === undefined
      ? LOCAL_ORIGINS
      : configured
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
  return new Set(origins.map(parseOrigin).filter(isDefined));
}

function parseOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.origin !== value ||
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return undefined;
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function corsHeaders(origin?: string): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function jsonResponse(
  status: number,
  value: unknown,
  origin?: string,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = corsHeaders(origin);
  for (const [key, headerValue] of Object.entries(extraHeaders ?? {})) {
    headers.set(key, headerValue);
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function bearerToken(request: Request): string | undefined {
  const value = request.headers.get("Authorization");
  return value?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
}

async function requestJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new InvalidRequestError("invalid_request");
  }
  const text = await request.text();
  if (!text || text.length > 16_384) {
    throw new InvalidRequestError("invalid_request");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidRequestError("invalid_request");
  }
}

function checkoutItemIds(body: unknown): string[] {
  if (
    !isRecord(body) ||
    !Array.isArray(body.itemIds) ||
    body.itemIds.length < 1 ||
    body.itemIds.length > 5
  )
    throw new InvalidRequestError("invalid_products");
  const ids = body.itemIds;
  if (ids.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    throw new InvalidRequestError("invalid_products");
  }
  const uniqueIds = [...new Set(ids as string[])];
  if (uniqueIds.length !== ids.length) {
    throw new InvalidRequestError("invalid_products");
  }
  return uniqueIds;
}

async function listProducts(
  config: PolarConfig,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>[]> {
  const url = new URL(POLAR_SANDBOX_API + "/products/");
  url.searchParams.set("organization_id", config.organizationId);
  url.searchParams.set("is_archived", "false");
  url.searchParams.set("is_recurring", "true");
  url.searchParams.set("visibility", "public");
  url.searchParams.set("limit", "100");
  const payload = await polarRequest(url, config, fetcher);
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new PolarPayloadError();
  }

  return payload.items.filter(
    (item): item is Record<string, unknown> =>
      isRecord(item) &&
      item.organization_id === config.organizationId &&
      item.is_archived === false &&
      item.is_recurring === true &&
      item.visibility === "public" &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      Array.isArray(item.prices) &&
      item.prices.some((price) => isRecord(price) && price.is_archived !== true),
  );
}

function mapProduct(product: Record<string, unknown>): Record<string, unknown> | undefined {
  const prices = (product.prices as unknown[])
    .filter(
      (price): price is Record<string, unknown> => isRecord(price) && price.is_archived !== true,
    )
    .map((price) => ({
      amountType: typeof price.amount_type === "string" ? price.amount_type : "",
      priceAmount: typeof price.price_amount === "number" ? price.price_amount : null,
      priceCurrency: typeof price.price_currency === "string" ? price.price_currency : "",
    }));
  if (prices.length === 0) return undefined;
  const benefits = Array.isArray(product.benefits)
    ? product.benefits
        .filter(
          (benefit): benefit is Record<string, unknown> =>
            isRecord(benefit) && typeof benefit.description === "string",
        )
        .map((benefit) => ({ description: benefit.description }))
    : [];
  return {
    id: product.id,
    name: product.name,
    description: typeof product.description === "string" ? product.description : null,
    recurringInterval:
      typeof product.recurring_interval === "string" ? product.recurring_interval : null,
    prices,
    benefits,
  };
}

function mapSubscription(
  value: unknown,
  userId: string,
  organizationId: string,
): Record<string, unknown> | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.status !== "string" ||
    typeof value.amount !== "number" ||
    !Number.isFinite(value.amount) ||
    typeof value.currency !== "string" ||
    !isRecord(value.product) ||
    typeof value.product.id !== "string" ||
    typeof value.product.name !== "string" ||
    !isRecord(value.customer) ||
    value.customer.external_id !== userId ||
    value.customer.organization_id !== organizationId
  )
    return null;
  return {
    id: value.id,
    status: value.status,
    amount: value.amount,
    currency: value.currency,
    recurringInterval:
      typeof value.recurring_interval === "string" ? value.recurring_interval : null,
    currentPeriodStart:
      typeof value.current_period_start === "string" ? value.current_period_start : null,
    currentPeriodEnd:
      typeof value.current_period_end === "string" ? value.current_period_end : null,
    product: { id: value.product.id, name: value.product.name },
  };
}

async function getCustomer(
  userId: string,
  config: PolarConfig,
  fetcher: typeof fetch,
): Promise<{ id: string }> {
  const url = new URL(
    POLAR_SANDBOX_API + "/customers/external/" + encodeURIComponent(userId),
  );
  const customer = await polarRequest(url, config, fetcher);
  if (
    !isRecord(customer) ||
    typeof customer.id !== "string" ||
    customer.external_id !== userId ||
    customer.organization_id !== config.organizationId ||
    customer.deleted_at !== null
  )
    throw new PolarApiError(404);
  return { id: customer.id };
}

async function polarRequest(
  url: URL,
  config: PolarConfig,
  fetcher: typeof fetch,
  options: { method?: "GET" | "POST"; body?: string } = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: options.method ?? "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + config.token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PolarApiError(0);
  }
  if (!response.ok) throw new PolarApiError(response.status);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new PolarPayloadError();
  }
}

function safeReturnUrl(origin?: string): string | undefined {
  return origin ? origin + "/" : undefined;
}

function isSandboxPolarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      host === "sandbox.polar.sh"
    );
  } catch {
    return false;
  }
}

function isSandboxCheckoutUrl(value: string): boolean {
  if (isSandboxPolarUrl(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "sandbox-api.polar.sh" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/v1\/checkout-links\/[A-Za-z0-9_-]{1,128}\/redirect\/?$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}
