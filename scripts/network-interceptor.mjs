import http from "node:http";
import https from "node:https";

const MSW_BRIDGE_PORT = process.env.MSW_BRIDGE_PORT;

if (MSW_BRIDGE_PORT) {
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;

  const patchRequest = (original) => {
    return function (options, callback) {
      const isHttps = original === originalHttpsRequest;
      const interceptedOptions = typeof options === "string" ? new URL(options) : { ...options };

      const originalHost = interceptedOptions.hostname || interceptedOptions.host;
      const originalProtocol = isHttps ? "https:" : "http:";

      // 1. BYPASS: Only intercept specific services to avoid breaking pnpm/npm/etc.
      // We only want to intercept things that we actually have MSW handlers for.
      const shouldIntercept =
        originalHost &&
        (originalHost.includes("poki.io") ||
          originalHost.includes("supabase") ||
          originalHost.includes("discord"));

      if (!shouldIntercept || originalHost === "localhost" || originalHost === "127.0.0.1") {
        return originalHttpRequest(options, callback);
      }

      process.stderr.write(
        `[Interceptor] Redirecting ${originalProtocol}//${originalHost} to MSW Bridge\n`,
      );

      interceptedOptions.protocol = "http:";
      interceptedOptions.hostname = "localhost";
      interceptedOptions.port = MSW_BRIDGE_PORT;
      interceptedOptions.headers = {
        ...(interceptedOptions.headers || {}),
        "x-msw-original-host": originalHost,
        "x-msw-original-protocol": originalProtocol,
      };

      return originalHttpRequest(interceptedOptions, callback);
    };
  };

  http.request = patchRequest(originalHttpRequest);
  https.request = patchRequest(originalHttpsRequest);

  http.get = function (options, callback) {
    const req = http.request(options, callback);
    req.end();
    return req;
  };
  https.get = function (options, callback) {
    const req = https.request(options, callback);
    req.end();
    return req;
  };
}
