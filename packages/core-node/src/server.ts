import {
  ensurePNPM,
  PipelabContext,
  isDev,
  fetchPipelabAsset,
  registerAllHandlers,
  webSocketServer,
} from "./index";
import { getUiDevServerMissingWarning, uiDevPort } from "@pipelab/constants";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "http";
// @ts-expect-error serve-handler has no type definitions
import handler from "serve-handler";

export interface ServeOptions {
  port: string | number;
  userData?: string;
  nodePath?: string;
  pnpmPath?: string;
}

export const sendStartupProgress = (message: string) => {
  console.log(`[Startup Progress] ${message}`);
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

export async function serveCommand(options: ServeOptions, version: string, _dirname: string) {
  if (!options.userData) throw new Error("userDataPath is required for serveCommand");
  const releaseTag = version.includes("beta") ? "beta" : "latest";
  const context = new PipelabContext({
    userDataPath: options.userData,
    releaseTag,
  });

  let rawAssetFolder: string | undefined;
  if (!isDev) {
    rawAssetFolder = await fetchPipelabAsset("@pipelab/ui", releaseTag, { context });
  }

  const server = http.createServer(async (request, response) => {
    // Serve local media files securely via HTTP
    if (request.url?.startsWith("/media-file/")) {
      const prefix = "/media-file/";
      const encodedPath = request.url.substring(prefix.length);
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
            "Access-Control-Allow-Origin": "*",
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
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
            <h1 style="color: #38bdf8;">Pipelab Dev Mode</h1>
            <p>The CLI server is running (API/WebSocket), but the UI is not served here in development.</p>
            <p>Please open the UI through its own dev server (usually <a href="http://localhost:5173" style="color: #38bdf8;">http://localhost:5173</a>).</p>
          </body>
        </html>
      `);
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
  await webSocketServer.start(Number(options.port), server);

  await registerAllHandlers({
    version,
    context,
  });

  sendStartupReady();

  return server;
}
