import {
  type BillingDependencies,
  type BillingOperation,
  createBillingHandler,
  createSupabaseUserResolver,
} from "./billing.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";
const CUSTOMER_ID = "55555555-5555-4555-8555-555555555555";
const ORIGIN = "https://editor.example.test";
const LOCAL_POLAR_ENDPOINTS = {
  POLAR_API_BASE_URL: "http://127.0.0.1:8787/v1",
  POLAR_FRONTEND_BASE_URL: "http://127.0.0.1:8788",
  POLAR_CHECKOUT_LINK_BASE_URL: "http://127.0.0.1:8789",
};
const PRODUCTION_POLAR_ENDPOINTS = {
  POLAR_API_BASE_URL: "https://api.polar.sh/v1",
  POLAR_FRONTEND_BASE_URL: "https://polar.sh",
  POLAR_CHECKOUT_LINK_BASE_URL: "https://buy.polar.sh",
};

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      "Expected " + JSON.stringify(expected) + " but received " + JSON.stringify(actual),
    );
  }
}
function product(id = PRODUCT_ID): Record<string, unknown> {
  return {
    id,
    name: "Pro",
    description: "Hosted provider features",
    visibility: "public",
    is_archived: false,
    is_recurring: true,
    organization_id: ORG_ID,
    recurring_interval: "month",
    prices: [
      {
        id: "price-id",
        amount_type: "fixed",
        price_amount: 1200,
        price_currency: "usd",
        is_archived: false,
      },
    ],
    benefits: [
      {
        description: "Unlimited projects",
        id: "benefit-private-data",
      },
    ],
  };
}
function mockFetch(
  respond: (url: URL, init: RequestInit) => Response | Promise<Response>,
  calls: Array<{ url: URL; init: RequestInit }> = [],
): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });
    return await respond(url, init);
  }) as typeof fetch;
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function dependencies(
  fetcher: typeof fetch,
  options: {
    userId?: string | null;
    env?: Record<string, string | undefined>;
  } = {},
): BillingDependencies {
  const env: Record<string, string | undefined> = {
    ...LOCAL_POLAR_ENDPOINTS,
    POLAR_ACCESS_TOKEN: "mock-polar-token",
    POLAR_ORGANIZATION_ID: ORG_ID,
    POLAR_ALLOWED_ORIGINS: ORIGIN,
    ...options.env,
  };
  return {
    env: (name) => env[name],
    fetcher,
    resolveUser: (token) => {
      if (token !== "valid-token" || options.userId === null) {
        return Promise.resolve(null);
      }
      return Promise.resolve({ id: options.userId ?? USER_A });
    },
  };
}
function request(
  operation: BillingOperation,
  options: {
    authorization?: string;
    origin?: string;
    body?: string;
    method?: string;
  } = {},
): Request {
  return new Request("https://functions.example.test/" + operation, {
    method: options.method ?? "POST",
    headers: {
      ...(options.authorization ? { Authorization: options.authorization } : {}),
      ...(options.origin ? { Origin: options.origin } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body,
  });
}
async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test("private functions reject missing and expired bearer tokens before provider access", async () => {
  let providerCalls = 0;
  const handler = createBillingHandler(
    "polar-user-plan",
    dependencies(
      mockFetch(() => {
        providerCalls++;
        return json({ items: [] });
      }),
    ),
  );
  assertEquals((await handler(request("polar-user-plan"))).status, 401);
  assertEquals(
    (await handler(request("polar-user-plan", { authorization: "Bearer expired-token" }))).status,
    401,
  );
  assertEquals(providerCalls, 0);
});

Deno.test("plans map safe public fields and use the configured API endpoint", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const handler = createBillingHandler(
    "polar-available-plans",
    dependencies(
      mockFetch(() => json({ items: [product()], pagination: { total_count: 1 } }), calls),
    ),
  );
  const response = await handler(request("polar-available-plans", { origin: ORIGIN }));
  const body = await responseJson(response);
  const plans = body.plans as Array<Record<string, unknown>>;
  const firstPrice = (plans[0].prices as Array<Record<string, unknown>>)[0];
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assertEquals(calls[0].url.origin, "http://127.0.0.1:8787");
  assertEquals(calls[0].init.redirect, "error");
  assertEquals(calls[0].url.searchParams.get("organization_id"), ORG_ID);
  assertEquals(plans[0].id, PRODUCT_ID);
  assertEquals(plans[0].recurringInterval, "month");
  assertEquals(firstPrice.amountType, "fixed");
  assertEquals(firstPrice.priceAmount, 1200);
  assertEquals(firstPrice.priceCurrency, "usd");
  assertEquals(plans[0].benefits, [{ description: "Unlimited projects" }]);
  assertEquals(JSON.stringify(body).includes("benefit-private-data"), false);
});

Deno.test("empty plan catalog returns an empty array", async () => {
  const handler = createBillingHandler(
    "polar-available-plans",
    dependencies(mockFetch(() => json({ items: [] }))),
  );
  const response = await handler(request("polar-available-plans"));
  assertEquals(response.status, 200);
  assertEquals((await responseJson(response)).plans, []);
});

Deno.test("malformed provider responses fail safely without leaking details", async () => {
  const handler = createBillingHandler(
    "polar-available-plans",
    dependencies(mockFetch(() => new Response("private provider detail", { status: 500 }))),
  );
  const response = await handler(request("polar-available-plans"));
  assertEquals(response.status, 502);
  assertEquals(await response.text(), '{"error":"billing_provider_unavailable"}');
});

Deno.test("Polar API requests fail closed on redirects", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const handler = createBillingHandler(
    "polar-available-plans",
    dependencies(
      mockFetch((_url, init) => {
        if (init.redirect === "error") throw new TypeError("redirect blocked");
        return json({ items: [] });
      }, calls),
    ),
  );
  const response = await handler(request("polar-available-plans"));
  assertEquals(response.status, 502);
  assertEquals(calls[0].init.redirect, "error");
  assertEquals(await response.text(), '{"error":"billing_provider_unavailable"}');
});

Deno.test("missing Polar configuration fails before a provider request", async () => {
  let calls = 0;
  const handler = createBillingHandler(
    "polar-available-plans",
    dependencies(
      mockFetch(() => {
        calls++;
        return json({ items: [] });
      }),
      { env: { POLAR_ACCESS_TOKEN: undefined, POLAR_TOKEN: undefined } },
    ),
  );
  const response = await handler(request("polar-available-plans"));
  assertEquals(response.status, 503);
  assertEquals(await response.text(), '{"error":"billing_unavailable"}');
  assertEquals(calls, 0);
});

Deno.test("missing Polar endpoint settings fail before a provider request", async () => {
  for (const name of Object.keys(LOCAL_POLAR_ENDPOINTS)) {
    let calls = 0;
    const handler = createBillingHandler(
      "polar-available-plans",
      dependencies(
        mockFetch(() => {
          calls++;
          return json({ items: [] });
        }),
        { env: { [name]: undefined } },
      ),
    );
    const response = await handler(request("polar-available-plans"));
    assertEquals(response.status, 503);
    assertEquals(calls, 0);
  }
});

Deno.test("authenticated billing functions fail closed without Polar config", async () => {
  for (const operation of ["polar-user-plan", "customer-portal", "checkout"] as const) {
    let calls = 0;
    const handler = createBillingHandler(
      operation,
      dependencies(
        mockFetch(() => {
          calls++;
          return json({});
        }),
        { env: { POLAR_ACCESS_TOKEN: undefined, POLAR_TOKEN: undefined } },
      ),
    );
    const response = await handler(
      request(operation, {
        authorization: "Bearer valid-token",
        body: JSON.stringify({ itemIds: [PRODUCT_ID] }),
      }),
    );
    assertEquals(response.status, 503);
    assertEquals(await response.text(), '{"error":"billing_unavailable"}');
    assertEquals(calls, 0);
  }
});

Deno.test("subscriptions use the authenticated user and map UI-compatible fields only", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const handler = createBillingHandler(
    "polar-user-plan",
    dependencies(
      mockFetch(
        () =>
          json({
            items: [
              {
                id: "subscription-id",
                status: "active",
                amount: 1200,
                currency: "usd",
                recurring_interval: "month",
                current_period_start: "2026-01-01T00:00:00Z",
                current_period_end: "2026-02-01T00:00:00Z",
                product: { id: PRODUCT_ID, name: "Pro" },
                customer: {
                  external_id: USER_A,
                  organization_id: ORG_ID,
                  email: "must-not-be-returned@example.test",
                },
              },
            ],
          }),
        calls,
      ),
    ),
  );
  const response = await handler(
    request("polar-user-plan", {
      authorization: "Bearer valid-token",
      origin: ORIGIN,
      body: JSON.stringify({ userId: USER_B, email: "attacker@example.test" }),
    }),
  );
  const body = await responseJson(response);
  const subscriptions = body.subscriptions as Array<Record<string, unknown>>;
  assertEquals(response.status, 200);
  assertEquals(calls[0].url.searchParams.get("external_customer_id"), USER_A);
  assertEquals(subscriptions[0].currentPeriodStart, "2026-01-01T00:00:00Z");
  assertEquals(subscriptions[0].recurringInterval, "month");
  assertEquals(subscriptions[0].product, { id: PRODUCT_ID, name: "Pro" });
  assertEquals(JSON.stringify(body).includes("must-not-be-returned"), false);
  assertEquals(JSON.stringify(body).includes(USER_B), false);
});

Deno.test("users without subscriptions receive the free-plan state", async () => {
  const handler = createBillingHandler(
    "polar-user-plan",
    dependencies(mockFetch(() => json({ items: [] }))),
  );
  const response = await handler(
    request("polar-user-plan", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 200);
  assertEquals((await responseJson(response)).subscriptions, []);
});

Deno.test("subscription results are rejected if Polar returns another customer", async () => {
  const handler = createBillingHandler(
    "polar-user-plan",
    dependencies(
      mockFetch(() =>
        json({
          items: [
            {
              id: "subscription-id",
              status: "active",
              amount: 1200,
              currency: "usd",
              product: { id: PRODUCT_ID, name: "Pro" },
              customer: { external_id: USER_B, organization_id: ORG_ID },
            },
          ],
        }),
      ),
    ),
  );
  const response = await handler(
    request("polar-user-plan", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 502);
  assertEquals(await response.text(), '{"error":"billing_provider_unavailable"}');
});

Deno.test("customer portal resolves only the authenticated user's customer", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const handler = createBillingHandler(
    "customer-portal",
    dependencies(
      mockFetch((url) => {
        if (url.pathname.endsWith("/customers/external/" + USER_A)) {
          return json({
            id: CUSTOMER_ID,
            external_id: USER_A,
            organization_id: ORG_ID,
            deleted_at: null,
            email: "must-not-be-returned@example.test",
          });
        }
        if (url.pathname.endsWith("/customer-sessions/")) {
          return json(
            {
              customer_portal_url: "http://127.0.0.1:8788/portal/session",
            },
            201,
          );
        }
        return json({}, 404);
      }, calls),
    ),
  );
  const response = await handler(
    request("customer-portal", {
      authorization: "Bearer valid-token",
      origin: ORIGIN,
      body: JSON.stringify({ userId: USER_B }),
    }),
  );
  const body = await responseJson(response);
  const sessionBody = JSON.parse(String(calls[1].init.body)) as Record<string, unknown>;
  assertEquals(response.status, 200);
  assertEquals(calls.length, 2);
  assertEquals(calls[0].url.pathname, "/v1/customers/external/" + USER_A);
  assertEquals(sessionBody.customer_id, CUSTOMER_ID);
  assertEquals(sessionBody.return_url, ORIGIN + "/");
  assertEquals(body, {
    customerPortal: "http://127.0.0.1:8788/portal/session",
  });
});

Deno.test("customer portal refuses a mismatched external customer ID", async () => {
  let sessionCalls = 0;
  const handler = createBillingHandler(
    "customer-portal",
    dependencies(
      mockFetch((url) => {
        if (url.pathname.includes("/customers/external/")) {
          return json({
            id: CUSTOMER_ID,
            external_id: USER_B,
            organization_id: ORG_ID,
            deleted_at: null,
          });
        }
        sessionCalls++;
        return json({
          customer_portal_url: "http://127.0.0.1:8788/portal/session",
        });
      }),
    ),
  );
  const response = await handler(
    request("customer-portal", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 404);
  assertEquals(sessionCalls, 0);
});

Deno.test("customer portal rejects URLs outside the configured frontend endpoint", async () => {
  for (const destination of [
    "https://polar.sh/portal/session",
    "https://sandbox.polar.sh/portal/session",
    "https://sandbox.attacker.polar.sh/portal/session",
    "https://attacker.sandbox.polar.sh/portal/session",
    "https://sandbox-attacker.polar.sh/portal/session",
    "http://127.0.0.1:8789/portal/session",
  ]) {
    const handler = createBillingHandler(
      "customer-portal",
      dependencies(
        mockFetch((url) =>
          url.pathname.includes("/customers/external/")
            ? json({
                id: CUSTOMER_ID,
                external_id: USER_A,
                organization_id: ORG_ID,
                deleted_at: null,
              })
            : json({ customer_portal_url: destination }),
        ),
      ),
    );
    const response = await handler(
      request("customer-portal", { authorization: "Bearer valid-token" }),
    );
    assertEquals(response.status, 502);
  }
});

Deno.test("customer portal accepts the configured production frontend endpoint", async () => {
  const handler = createBillingHandler(
    "customer-portal",
    dependencies(
      mockFetch((url) =>
        url.pathname.includes("/customers/external/")
          ? json({
              id: CUSTOMER_ID,
              external_id: USER_A,
              organization_id: ORG_ID,
              deleted_at: null,
            })
          : json({
              customer_portal_url: "https://polar.sh/acme/portal/session",
            }),
      ),
      { env: PRODUCTION_POLAR_ENDPOINTS },
    ),
  );
  const response = await handler(
    request("customer-portal", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 200);
  assertEquals(
    (await responseJson(response)).customerPortal,
    "https://polar.sh/acme/portal/session",
  );
});

Deno.test("checkout rejects products outside the active public catalog", async () => {
  let checkoutCalls = 0;
  const handler = createBillingHandler(
    "checkout",
    dependencies(
      mockFetch((url) => {
        if (url.pathname.endsWith("/products/")) {
          return json({ items: [product()] });
        }
        checkoutCalls++;
        return json({ url: "http://127.0.0.1:8788/checkout/session" }, 201);
      }),
    ),
  );
  const response = await handler(
    request("checkout", {
      authorization: "Bearer valid-token",
      body: JSON.stringify({ itemIds: [USER_B] }),
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(checkoutCalls, 0);
});

Deno.test("checkout uses the authenticated user and returns its configured URL", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const handler = createBillingHandler(
    "checkout",
    dependencies(
      mockFetch(
        (url) =>
          url.pathname.endsWith("/products/")
            ? json({ items: [product()] })
            : json({ url: "http://127.0.0.1:8788/checkout/session" }, 201),
        calls,
      ),
    ),
  );
  const response = await handler(
    request("checkout", {
      authorization: "Bearer valid-token",
      origin: ORIGIN,
      body: JSON.stringify({
        itemIds: [PRODUCT_ID],
        userId: USER_B,
        email: "attacker@example.test",
      }),
    }),
  );
  const body = await responseJson(response);
  const checkoutBody = JSON.parse(String(calls[1].init.body)) as Record<string, unknown>;
  assertEquals(response.status, 200);
  assertEquals(body, {
    checkoutURL: "http://127.0.0.1:8788/checkout/session",
  });
  assertEquals(checkoutBody.products, [PRODUCT_ID]);
  assertEquals(checkoutBody.external_customer_id, USER_A);
  assertEquals(checkoutBody.success_url, ORIGIN + "/?billing=success");
  assertEquals(checkoutBody.customer_email, undefined);
  assertEquals(calls[1].url.origin, "http://127.0.0.1:8787");
});

Deno.test("checkout rejects URLs outside configured Polar endpoints", async () => {
  const handler = createBillingHandler(
    "checkout",
    dependencies(
      mockFetch((url) =>
        url.pathname.endsWith("/products/")
          ? json({ items: [product()] })
          : json({ url: "https://checkout.attacker.example/checkout/session" }, 201),
      ),
    ),
  );
  const response = await handler(
    request("checkout", {
      authorization: "Bearer valid-token",
      body: JSON.stringify({ itemIds: [PRODUCT_ID] }),
    }),
  );
  assertEquals(response.status, 502);
});

Deno.test("checkout accepts only configured production checkout endpoints", async () => {
  for (const destination of [
    "https://polar.sh/checkout/session-secret",
    "https://buy.polar.sh/polar_cl_live",
    "https://api.polar.sh/v1/checkout-links/polar_cl_live/redirect",
  ]) {
    const handler = createBillingHandler(
      "checkout",
      dependencies(
        mockFetch((url) =>
          url.pathname.endsWith("/products/")
            ? json({ items: [product()] })
            : json({ url: destination }, 201),
        ),
        { env: PRODUCTION_POLAR_ENDPOINTS },
      ),
    );
    const response = await handler(
      request("checkout", {
        authorization: "Bearer valid-token",
        body: JSON.stringify({ itemIds: [PRODUCT_ID] }),
      }),
    );
    assertEquals(response.status, 200);
    assertEquals((await responseJson(response)).checkoutURL, destination);
  }

  for (const destination of [
    "https://api.attacker.example/v1/checkout-links/id/redirect",
    "https://polar.sh.attacker.example/checkout/session-secret",
    "https://polar.sh/checkout/session-secret/other",
    "https://polar.sh/checkout/session-secret?next=https://attacker.example",
    "https://buy.polar.sh/checkout/session",
  ]) {
    const handler = createBillingHandler(
      "checkout",
      dependencies(
        mockFetch((url) =>
          url.pathname.endsWith("/products/")
            ? json({ items: [product()] })
            : json({ url: destination }, 201),
        ),
        { env: PRODUCTION_POLAR_ENDPOINTS },
      ),
    );
    const response = await handler(
      request("checkout", {
        authorization: "Bearer valid-token",
        body: JSON.stringify({ itemIds: [PRODUCT_ID] }),
      }),
    );
    assertEquals(response.status, 502);
  }
});

Deno.test("untrusted origins and malformed requests fail before provider access", async () => {
  let calls = 0;
  const handler = createBillingHandler(
    "polar-available-plans",
    dependencies(
      mockFetch(() => {
        calls++;
        return json({ items: [] });
      }),
    ),
  );
  const response = await handler(
    request("polar-available-plans", { origin: "https://evil.example.test" }),
  );
  assertEquals(response.status, 403);
  assertEquals(calls, 0);
});

Deno.test("preflight returns a narrow non-credentialed CORS policy", async () => {
  const handler = createBillingHandler(
    "polar-available-plans",
    dependencies(mockFetch(() => json({ items: [] }))),
  );
  const response = await handler(
    request("polar-available-plans", { origin: ORIGIN, method: "OPTIONS" }),
  );
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assertEquals(response.headers.get("Access-Control-Allow-Credentials"), null);
  assertEquals(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});

Deno.test("Supabase resolver validates access tokens using the Auth user endpoint", async () => {
  const variables: Record<string, string | undefined> = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_PUBLISHABLE_KEY: "public-key",
    SUPABASE_ANON_KEY: "legacy-key",
  };
  const env = (name: string) => variables[name];
  const fetcher = mockFetch((url, init) => {
    assertEquals(url.toString(), "http://127.0.0.1:54321/auth/v1/user");
    assertEquals(new Headers(init.headers).get("Authorization"), "Bearer valid-token");
    assertEquals(new Headers(init.headers).get("apikey"), "public-key");
    return json({ id: USER_A, email: "not-returned@example.test" });
  });
  const resolver = createSupabaseUserResolver(env, fetcher);
  assertEquals(await resolver("valid-token"), { id: USER_A });
});

Deno.test("malformed checkout bodies are rejected without provider calls", async () => {
  let calls = 0;
  const handler = createBillingHandler(
    "checkout",
    dependencies(
      mockFetch(() => {
        calls++;
        return json({ items: [] });
      }),
    ),
  );
  const response = await handler(
    request("checkout", {
      authorization: "Bearer valid-token",
      body: "{not-json",
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(calls, 0);
});

Deno.test("private handlers return 502 for malformed subscription data", async () => {
  const handler = createBillingHandler(
    "polar-user-plan",
    dependencies(mockFetch(() => json({ items: [{ id: "bad-subscription" }] }))),
  );
  const response = await handler(
    request("polar-user-plan", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 502);
  assertEquals(await response.text(), '{"error":"billing_provider_unavailable"}');
});

Deno.test("subscription provider failures return a generic response", async () => {
  const handler = createBillingHandler(
    "polar-user-plan",
    dependencies(mockFetch(() => new Response("private Polar detail", { status: 503 }))),
  );
  const response = await handler(
    request("polar-user-plan", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 502);
  assertEquals(await response.text(), '{"error":"billing_provider_unavailable"}');
});

Deno.test("customer portal provider failures return a generic response", async () => {
  const handler = createBillingHandler(
    "customer-portal",
    dependencies(
      mockFetch((url) =>
        url.pathname.includes("/customers/external/")
          ? json({
              id: CUSTOMER_ID,
              external_id: USER_A,
              organization_id: ORG_ID,
              deleted_at: null,
            })
          : new Response("private Polar detail", { status: 503 }),
      ),
    ),
  );
  const response = await handler(
    request("customer-portal", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 502);
  assertEquals(await response.text(), '{"error":"billing_provider_unavailable"}');
});

Deno.test("checkout provider failures return a generic response", async () => {
  const handler = createBillingHandler(
    "checkout",
    dependencies(
      mockFetch((url) =>
        url.pathname.endsWith("/products/")
          ? json({ items: [product()] })
          : new Response("private Polar detail", { status: 503 }),
      ),
    ),
  );
  const response = await handler(
    request("checkout", {
      authorization: "Bearer valid-token",
      body: JSON.stringify({ itemIds: [PRODUCT_ID] }),
    }),
  );
  assertEquals(response.status, 502);
  assertEquals(await response.text(), '{"error":"billing_provider_unavailable"}');
});

Deno.test("customer session lookup maps a missing Polar customer to 404", async () => {
  const handler = createBillingHandler(
    "customer-portal",
    dependencies(mockFetch(() => new Response("not found", { status: 404 }))),
  );
  const response = await handler(
    request("customer-portal", { authorization: "Bearer valid-token" }),
  );
  assertEquals(response.status, 404);
  assertEquals(await response.text(), '{"error":"billing_customer_not_found"}');
});

Deno.test("Desktop-style calls without an Origin omit external return URLs", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const handler = createBillingHandler(
    "customer-portal",
    dependencies(
      mockFetch(
        (url) =>
          url.pathname.includes("/customers/external/")
            ? json({
                id: CUSTOMER_ID,
                external_id: USER_A,
                organization_id: ORG_ID,
                deleted_at: null,
              })
            : json({
                customer_portal_url: "http://127.0.0.1:8788/portal/session",
              }),
        calls,
      ),
    ),
  );
  const response = await handler(
    request("customer-portal", { authorization: "Bearer valid-token" }),
  );
  const sessionBody = JSON.parse(String(calls[1].init.body)) as Record<string, unknown>;
  assertEquals(response.status, 200);
  assertEquals(sessionBody.customer_id, CUSTOMER_ID);
  assertEquals(sessionBody.return_url, undefined);
});

Deno.test("checkout-link redirect URLs from the configured API are accepted", async () => {
  const handler = createBillingHandler(
    "checkout",
    dependencies(
      mockFetch((url) =>
        url.pathname.endsWith("/products/")
          ? json({ items: [product()] })
          : json(
              {
                url: "http://127.0.0.1:8787/v1/checkout-links/polar_cl_test/redirect",
              },
              201,
            ),
      ),
    ),
  );
  const response = await handler(
    request("checkout", {
      authorization: "Bearer valid-token",
      body: JSON.stringify({ itemIds: [PRODUCT_ID] }),
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(
    (await responseJson(response)).checkoutURL,
    "http://127.0.0.1:8787/v1/checkout-links/polar_cl_test/redirect",
  );
});

Deno.test("Supabase resolver treats invalid or expired JWTs as unauthenticated", async () => {
  const env = (name: string) =>
    (
      ({
        SUPABASE_URL: "http://kong:8000",
        SUPABASE_ANON_KEY: "legacy-key",
      }) as Record<string, string | undefined>
    )[name];
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const resolver = createSupabaseUserResolver(
    env,
    mockFetch(() => new Response("invalid token", { status: 401 }), calls),
  );
  assertEquals(await resolver("expired-token"), null);
  assertEquals(calls[0].init.redirect, "error");
});
