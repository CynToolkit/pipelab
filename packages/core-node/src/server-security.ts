import type { IncomingMessage } from "node:http";

export const DEFAULT_SERVER_HOST = "127.0.0.1";
export const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

export interface ServerSecurityOptions {
  host?: string;
  authToken?: string;
  allowedOrigins?: string[];
}

export const isLoopbackHost = (host: string): boolean =>
  host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";

export const requiresAuthentication = (host: string): boolean => !isLoopbackHost(host);

export const hasValidAuthToken = (
  request: IncomingMessage,
  expectedToken: string | undefined,
): boolean => {
  if (!expectedToken) return false;

  const authorization = request.headers.authorization;
  if (authorization === `Bearer ${expectedToken}`) return true;

  const requestUrl = new URL(request.url || "/", "http://localhost");
  return requestUrl.searchParams.get("token") === expectedToken;
};

export const isAllowedOrigin = (
  request: IncomingMessage,
  allowedOrigins: string[] = [],
  serverHost?: string,
): boolean => {
  const origin = request.headers.origin;
  if (!origin) return true;
  if ((origin === "null" || origin === "file://") && serverHost && isLoopbackHost(serverHost)) {
    return true;
  }
  if (allowedOrigins.includes(origin)) return true;

  const host = request.headers.host;
  return origin === `http://${host}` || origin === `https://${host}`;
};

export const isAuthorizedRequest = (
  request: IncomingMessage,
  options: ServerSecurityOptions & { host: string },
): boolean => {
  if (!isAllowedOrigin(request, options.allowedOrigins, options.host)) return false;
  if (!requiresAuthentication(options.host)) return true;
  return hasValidAuthToken(request, options.authToken);
};
