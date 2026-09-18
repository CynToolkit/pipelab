import { PipelabContext, isDev, registerAllHandlers, webSocketServer } from "./index";
import { resolveBundledUiFolder } from "./bundled-cli";
import {
  getUiDevServerMissingWarning,
  uiDevPort,
} from "@pipelab/constants";
import { existsSync } from "node:fs";
import http from "http";
import { readFile } from "node:fs/promises";
import handler from "serve-handler";
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_SERVER_HOST,
  isAuthorizedRequest,
  type ServerSecurityOptions,
} from "./server-security";

export interface ServeOptions {
  port: string | number;
  userData?: string;
  nodePath?: string;
  pnpmPath?: string;
  host?: string;
  authToken?: string;
  allowedOrigin?: string;
}

export const sendStartupProgress = (message: string) => {
  webSocketServer.broadcast("startup:progress", {
    type: "progress",
    data: { message },
  });
};

export const sendStartupReady = () => {
  console.log(`[Startup Progress] Ready!`);
  webSocketServer.broadcast("startup:progress", {
    type: "ready",
  });
};

export async function serveCommand(options: ServeOptions, version: string, cliDirname: string) {
  if (!options.userData) throw new Error("userDataPath is required for serveCommand");
  const releaseTag = version.includes("beta") ? "beta" : "latest";
  const context = new PipelabContext({
    userDataPath: options.userData,
    releaseTag,
  });
  const security: ServerSecurityOptions & { host: string } = {
    host: options.host || DEFAULT_SERVER_HOST,
    authToken: options.authToken || process.env.PIPELAB_AUTH_TOKEN,
    allowUnauthenticated: isDev,
    allowedOrigins: [
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(options.allowedOrigin ? [options.allowedOrigin] : []),
    ],
  };
  let rawAssetFolder: string | undefined;
  if (!isDev) {
    rawAssetFolder = resolveBundledUiFolder(cliDirname);
  }

  const server = http.createServer(async (request, response) => {
    const urlObj = request.url ? new URL(request.url, "http://localhost") : null;
    // Serve local media files securely via HTTP
    if (urlObj && urlObj.pathname.startsWith("/media-file/")) {
      if (!isAuthorizedRequest(request, security)) {
        response.writeHead(401, { "Content-Type": "text/plain" });
        response.end("Unauthorized");
        return;
      }

      const prefix = "/media-file/";
      const encodedPath = urlObj.pathname.substring(prefix.length);
      const filePath = decodeURIComponent(encodedPath);
      // Strip leading slash on Windows if followed by a drive letter (e.g. /C:/...)
      const normalizedPath =
        filePath.startsWith("/") && filePath.match(/^\/[a-zA-Z]:/)
          ? filePath.substring(1)
          : filePath;

      if (existsSync(normalizedPath)) {
        try {
          const content = await readFile(normalizedPath);
          let contentType = "application/octet-stream";
          if (normalizedPath.endsWith(".png")) contentType = "image/png";
          else if (normalizedPath.endsWith(".jpg") || normalizedPath.endsWith(".jpeg"))
            contentType = "image/jpeg";
          else if (normalizedPath.endsWith(".svg")) contentType = "image/svg+xml";
          else if (normalizedPath.endsWith(".gif")) contentType = "image/gif";
          else if (normalizedPath.endsWith(".webp")) contentType = "image/webp";

          response.writeHead(200, {
            "Content-Type": contentType,
          });
          response.end(content);
          return;
        } catch (e) {
          response.writeHead(500, { "Content-Type": "text/plain" });
          response.end(`Error reading file: ${e}`);
          return;
        }
      } else {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end(`File not found: ${normalizedPath}`);
        return;
      }
    }

    if (isDev) {
      const requestHost = request.headers.host?.split(":")[0] || "localhost";
      response.writeHead(302, {
        Location: `http://${requestHost}:${uiDevPort}${request.url || "/"}`,
      });
      response.end();
      return;
    }

    if (!rawAssetFolder || !existsSync(rawAssetFolder)) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end(
        `Error: UI directory not found at ${rawAssetFolder}.\n` +
          "Please run 'pnpm build' in apps/ui to generate the distribution.",
      );
      return;
    }

    return handler(request, response, {
      public: rawAssetFolder,
      rewrites: [{ source: "/**", destination: "/index.html" }],
    });
  });

  console.log(`Starting Pipelab server on port ${options.port}...`);
  if (isDev) {
    console.info(getUiDevServerMissingWarning());
    console.log(`UI available at http://localhost:${uiDevPort}`);
  } else {
    console.log(`UI available at http://localhost:${options.port}`);
  }

  // Start the server EARLY so the UI can connect and receive progress updates
  await webSocketServer.start(Number(options.port), server, security);

  await registerAllHandlers({
    version,
    context,
  });

  sendStartupReady();

  return server;
}
