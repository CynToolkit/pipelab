const POLAR_API_BASE_URL = "https://api.polar.sh/v1";
const POLAR_PORTAL_HOST = "polar.sh";
const POLAR_CHECKOUT_SESSION_HOST = "polar.sh";
const POLAR_CHECKOUT_LINK_HOST = "buy.polar.sh";

export function polarApiBaseUrl(): string {
  return POLAR_API_BASE_URL;
}

export function isPolarPortalUrl(value: string): boolean {
  return hasPolarHost(value, POLAR_PORTAL_HOST);
}

export function isPolarCheckoutUrl(value: string): boolean {
  if (isCheckoutSessionUrl(value, POLAR_CHECKOUT_SESSION_HOST)) return true;
  if (isCheckoutLinkUrl(value, POLAR_CHECKOUT_LINK_HOST)) return true;

  try {
    const url = new URL(value);
    const apiHost = new URL(POLAR_API_BASE_URL).hostname;
    return (
      url.protocol === "https:" &&
      url.hostname === apiHost &&
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

function isCheckoutSessionUrl(value: string, hostname: string): boolean {
  const url = polarUrlOnHost(value, hostname);
  return !!url && /^\/checkout\/[^/]{1,256}$/.test(url.pathname) && !url.search && !url.hash;
}

function isCheckoutLinkUrl(value: string, hostname: string): boolean {
  const url = polarUrlOnHost(value, hostname);
  return !!url && /^\/polar_cl_[A-Za-z0-9_-]{1,128}\/?$/.test(url.pathname) && !url.hash;
}

function hasPolarHost(value: string, hostname: string): boolean {
  return polarUrlOnHost(value, hostname) !== undefined;
}

function polarUrlOnHost(value: string, hostname: string): URL | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.hostname === hostname &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return url;
    return undefined;
  } catch {
    return undefined;
  }
}
