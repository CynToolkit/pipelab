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
  const apiBaseUrl = configuredUrl(
    env("POLAR_API_BASE_URL") || env("POLAR_SERVER"),
    false,
  );
  const frontendBaseUrl = configuredUrl(env("POLAR_FRONTEND_BASE_URL"), true);
  const checkoutLinkBaseUrl = configuredUrl(env("POLAR_CHECKOUT_LINK_BASE_URL"), true);
  if (!apiBaseUrl || !frontendBaseUrl || !checkoutLinkBaseUrl) return undefined;
  return { apiBaseUrl, frontendBaseUrl, checkoutLinkBaseUrl };
}

export function isPolarPortalUrl(value: string, endpoints: PolarEndpoints): boolean {
  return urlOnOrigin(value, endpoints.frontendBaseUrl) !== undefined;
}

export function isPolarCheckoutUrl(value: string, endpoints: PolarEndpoints): boolean {
  if (isCheckoutSessionUrl(value, endpoints.frontendBaseUrl)) return true;
  if (isCheckoutLinkUrl(value, endpoints.checkoutLinkBaseUrl)) return true;
  return isApiCheckoutRedirect(value, endpoints.apiBaseUrl);
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

function isCheckoutSessionUrl(value: string, frontendBaseUrl: string): boolean {
  const url = urlOnOrigin(value, frontendBaseUrl);
  return !!url && /^\/checkout\/[^/]{1,256}$/.test(url.pathname) && !url.search && !url.hash;
}

function isCheckoutLinkUrl(value: string, checkoutLinkBaseUrl: string): boolean {
  const url = urlOnOrigin(value, checkoutLinkBaseUrl);
  return !!url && /^\/polar_cl_[A-Za-z0-9_-]{1,128}\/?$/.test(url.pathname) && !url.hash;
}

function isApiCheckoutRedirect(value: string, apiBaseUrl: string): boolean {
  const url = urlOnOrigin(value, apiBaseUrl);
  if (!url) return false;

  const basePath = new URL(apiBaseUrl).pathname.replace(/\/+$/, "");
  if (basePath && !url.pathname.startsWith(basePath + "/")) return false;
  const checkoutPath = url.pathname.slice(basePath.length);
  return (
    /^\/checkout-links\/[A-Za-z0-9_-]{1,128}\/redirect\/?$/.test(checkoutPath) &&
    !url.search &&
    !url.hash
  );
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
