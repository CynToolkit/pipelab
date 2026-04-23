import {
  webSocketServer,
  isDev,
  registerAllHandlers,
  fetchPipelabAsset,
} from "./index";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import http from "http";
import handler from "serve-handler";
import { registerMigrationHandlers } from "./migrations";

export interface ServeOptions {
  port: string | number;
  userData?: string;
  nodePath?: string;
  pnpmPath?: string;
}

export async function serveCommand(options: ServeOptions, version: string, dirname: string) {
  let rawAssetFolder: string | undefined;
  if (!isDev) {
    rawAssetFolder = await fetchPipelabAsset("@pipelab/ui");
  }

  const server = http.createServer(async (request, response) => {
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
    });
  });

  console.log(`Starting Pipelab server on port ${options.port}...`);
  console.log(`UI available at http://localhost:${options.port}`);

  let { nodePath, pnpmPath } = options;

  if (!isDev) {
    const { ensureNodeJS, ensurePNPM } = await import("./utils/ensurers");
    if (!nodePath) {
      try {
        nodePath = await ensureNodeJS("24.14.1");
      } catch (e) {
        console.warn("[Server] Failed to ensure Node.js, using default process.execPath:", e);
        nodePath = process.execPath;
      }
    }
    if (!pnpmPath) {
      try {
        pnpmPath = await ensurePNPM();
      } catch (e) {
        console.warn("[Server] Failed to ensure PNPM, dependencies might fail to install:", e);
      }
    }
  }

  await registerAllHandlers({
    version,
    nodePath,
    pnpmPath,
  });
  registerMigrationHandlers();

  await webSocketServer.start(Number(options.port), server);
  return server;
}
