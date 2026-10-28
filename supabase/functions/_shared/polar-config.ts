export type PolarEndpoints = {
  apiBaseUrl: string;
  frontendBaseUrl: string;
  checkoutLinkBaseUrl: string;
};

const LOCAL_ENDPOINT_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"];

export function getPolarAccessToken(
  env: (name: string) => string | undefined,
): string | undefined {
  return env("POLAR_ACCESS_TOKEN")?.trim() || env("POLAR_TOKEN")?.trim() || undefined;
}

export function getPolarEndpoints(
  env: (name: string) => string | undefined,
): PolarEndpoints | undefined {
  const apiBaseUrl = configuredUrl(env("POLAR_API_BASE_URL"), false);
  const frontendBaseUrl = configuredUrl(env("POLAR_FRONTEND_BASE_URL"), true);
  const checkoutLinkBaseUrl = configuredUrl(env("POLAR_CHECKOUT_LINK_BASE_URL"), true);
  if (!apiBaseUrl || !frontendBaseUrl || !checkoutLinkBaseUrl) return undefined;
  return { apiBaseUrl, frontendBaseUrl, checkoutLinkBaseUrl };
}

export function isPolarPortalUrl(value: string, endpoints: PolarEndpoints): boolean {
  return urlOnOrigin(value, endpoints.frontendBaseUrl) !== undefined;
}

export function isPolarCheckoutUrl(value: string, endpoints: PolarEndpoints): boolean {
  return [
    endpoints.frontendBaseUrl,
    endpoints.checkoutLinkBaseUrl,
    endpoints.apiBaseUrl,
  ].some((baseUrl) => urlOnOrigin(value, baseUrl) !== undefined);
}

function configuredUrl(value: string | undefined, originOnly: boolean): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && LOCAL_ENDPOINT_HOSTS.includes(url.hostname))) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (originOnly && url.pathname !== "/")
    ) {
      return undefined;
    }
    if (originOnly) return url.origin;
    const path = url.pathname.replace(/\/+$/, "");
    return url.origin + path;
  } catch {
    return undefined;
  }
}

function urlOnOrigin(value: string, baseUrl: string): URL | undefined {
  try {
    const url = new URL(value);
    const base = new URL(baseUrl);
    if (url.origin === base.origin && !url.username && !url.password) return url;
    return undefined;
  } catch {
    return undefined;
  }
}
