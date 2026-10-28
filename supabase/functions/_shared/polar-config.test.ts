import {
  getPolarAccessToken,
  getPolarEndpoints,
  isPolarCheckoutUrl,
  isPolarPortalUrl,
} from "./polar-config.ts";

const localValues = {
  POLAR_API_BASE_URL: "http://127.0.0.1:8787/v1",
  POLAR_FRONTEND_BASE_URL: "http://127.0.0.1:8788",
  POLAR_CHECKOUT_LINK_BASE_URL: "http://127.0.0.1:8789",
};

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      "Expected " + JSON.stringify(expected) + " but received " + JSON.stringify(actual),
    );
  }
}

function configuredEndpoints(values: Record<string, string | undefined> = localValues) {
  return getPolarEndpoints((name) => values[name]);
}

Deno.test("reads the existing Polar access-token secret and supports the previous name", () => {
  assertEquals(
    getPolarAccessToken((name) =>
      ({ POLAR_ACCESS_TOKEN: " access-token ", POLAR_TOKEN: "legacy-token" })[name]
    ),
    "access-token",
  );
  assertEquals(
    getPolarAccessToken((name) => ({ POLAR_TOKEN: " legacy-token " })[name]),
    "legacy-token",
  );
});

Deno.test("does not treat the Polar SDK server mode as an API base URL", () => {
  assertEquals(
    getPolarEndpoints((name) => ({
      POLAR_SERVER: "production",
      POLAR_FRONTEND_BASE_URL: localValues.POLAR_FRONTEND_BASE_URL,
      POLAR_CHECKOUT_LINK_BASE_URL: localValues.POLAR_CHECKOUT_LINK_BASE_URL,
    })[name]),
    undefined,
  );
});

Deno.test("reads Polar endpoints from the supplied environment", () => {
  assertEquals(configuredEndpoints(), {
    apiBaseUrl: localValues.POLAR_API_BASE_URL,
    frontendBaseUrl: localValues.POLAR_FRONTEND_BASE_URL,
    checkoutLinkBaseUrl: localValues.POLAR_CHECKOUT_LINK_BASE_URL,
  });
  assertEquals(
    configuredEndpoints({
      POLAR_API_BASE_URL: "https://api.example.test/v2",
      POLAR_FRONTEND_BASE_URL: "https://billing.example.test",
      POLAR_CHECKOUT_LINK_BASE_URL: "https://links.example.test",
    }),
    {
      apiBaseUrl: "https://api.example.test/v2",
      frontendBaseUrl: "https://billing.example.test",
      checkoutLinkBaseUrl: "https://links.example.test",
    },
  );
});

Deno.test("requires each Polar endpoint setting", () => {
  for (const missing of [
    "POLAR_API_BASE_URL",
    "POLAR_FRONTEND_BASE_URL",
    "POLAR_CHECKOUT_LINK_BASE_URL",
  ]) {
    const values = { ...localValues, [missing]: undefined };
    assertEquals(configuredEndpoints(values), undefined);
  }
});

Deno.test("rejects unsafe or malformed endpoint settings", () => {
  for (const [name, value] of [
    ["POLAR_API_BASE_URL", "http://billing.example.test/v1"],
    ["POLAR_API_BASE_URL", "https://user:secret@api.example.test/v1"],
    ["POLAR_FRONTEND_BASE_URL", "https://billing.example.test/path"],
    ["POLAR_CHECKOUT_LINK_BASE_URL", "https://links.example.test/?next=other"],
  ]) {
    assertEquals(configuredEndpoints({ ...localValues, [name]: value }), undefined);
  }
});

Deno.test("portal URLs must use the configured frontend origin", () => {
  const endpoints = configuredEndpoints();
  if (!endpoints) throw new Error("Local Polar endpoint settings were rejected");
  assertEquals(isPolarPortalUrl("http://127.0.0.1:8788/portal/session", endpoints), true);
  assertEquals(isPolarPortalUrl("http://127.0.0.1:8789/portal/session", endpoints), false);
  assertEquals(isPolarPortalUrl("https://billing.example.test/portal/session", endpoints), false);
});

Deno.test("checkout URLs must match a configured endpoint and path", () => {
  const endpoints = configuredEndpoints();
  if (!endpoints) throw new Error("Local Polar endpoint settings were rejected");
  for (const url of [
    "http://127.0.0.1:8788/checkout/session-secret",
    "http://127.0.0.1:8789/polar_cl_test",
    "http://127.0.0.1:8787/v1/checkout-links/polar_cl_test/redirect",
  ]) {
    assertEquals(isPolarCheckoutUrl(url, endpoints), true);
  }
  for (const url of [
    "http://127.0.0.1:8790/checkout/session-secret",
    "http://127.0.0.1:8788/checkout/session-secret/other",
    "http://127.0.0.1:8788/checkout/session-secret?next=https://attacker.example",
    "http://127.0.0.1:8789/polar_cl_test/other",
    "http://127.0.0.1:8787/v1/checkout-links/polar_cl_test/redirect?next=other",
  ]) {
    assertEquals(isPolarCheckoutUrl(url, endpoints), false);
  }
});
