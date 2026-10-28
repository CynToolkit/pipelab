export type PolarEnvironment = "sandbox" | "production";

type PolarEnvironmentConfig = {
  apiBaseUrl: string;
  portalHost: string;
  checkoutSessionHost: string;
  checkoutLinkHost?: string;
};

const POLAR_CONFIG: Record<PolarEnvironment, PolarEnvironmentConfig> = {
  sandbox: {
    apiBaseUrl: "https://sandbox-api.polar.sh/v1",
    portalHost: "sandbox.polar.sh",
    checkoutSessionHost: "sandbox.polar.sh",
  },
  production: {
    apiBaseUrl: "https://api.polar.sh/v1",
    portalHost: "polar.sh",
    checkoutSessionHost: "polar.sh",
    checkoutLinkHost: "buy.polar.sh",
  },
};

export function getPolarEnvironment(
  env: (name: string) => string | undefined,
): PolarEnvironment | undefined {
  const value = env("POLAR_ENVIRONMENT");
  if (value === undefined) return "sandbox";
  return value === "sandbox" || value === "production" ? value : undefined;
}

export function polarApiBaseUrl(environment: PolarEnvironment): string {
  return POLAR_CONFIG[environment].apiBaseUrl;
}

export function isPolarPortalUrl(value: string, environment: PolarEnvironment): boolean {
  return hasPolarHost(value, POLAR_CONFIG[environment].portalHost);
}

export function isPolarCheckoutUrl(value: string, environment: PolarEnvironment): boolean {
  const config = POLAR_CONFIG[environment];
  if (isCheckoutSessionUrl(value, config.checkoutSessionHost)) return true;
  if (config.checkoutLinkHost && isCheckoutLinkUrl(value, config.checkoutLinkHost)) return true;

  try {
    const url = new URL(value);
    const apiHost = new URL(config.apiBaseUrl).hostname;
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
