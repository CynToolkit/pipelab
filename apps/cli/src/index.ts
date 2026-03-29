#!/usr/bin/env node
import cac from "cac";
import { WebSocketServer, setAssetsPath, assetsPath } from "@pipelab/core-node";
import { registerAllHandlers } from "@pipelab/core-node";
import { join } from "path";
import http from "http";
import handler from "serve-handler";

const cli = cac("pipelab");

cli
  .command("serve", "Start the standalone WebSocket server")
  .option("-p, --port <port>", "Port to listen on", { default: 33753 })
  .option("--user-data <path>", "Custom user data path")
  .action(async (options) => {
    const isDev = process.env.NODE_ENV === "development";
    // In dev, assets are in ../assets relative to dist/index.js
    // In pkg, they are also in ../assets relative to the bundled dist/index.js
    const _assetsPath = assetsPath;
    const uiPath = join(_assetsPath, "ui");

    // Setup minimal context for headless mode
    setAssetsPath(_assetsPath);

    console.log("isDev", isDev);

    const server = http.createServer(async (request, response) => {
      if (isDev) {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end(
          "Pipelab CLI Server (Development Mode)\n" +
            "WebSocket API is active.\n" +
            "UI is NOT served by this server in dev mode. Please run 'pnpm dev' in apps/ui.",
        );
        return;
      }

      const { existsSync } = await import("node:fs");
      if (!existsSync(uiPath)) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end(
          `Error: UI directory not found at ${uiPath}.\n` +
            "Please run 'pnpm build' in apps/ui to generate the distribution.",
        );
        return;
      }

      return handler(request, response, {
        public: uiPath,
      });
    });

    console.log(`Starting Pipelab server on port ${options.port}...`);
    console.log(`UI available at http://localhost:${options.port}`);

    await registerAllHandlers();
    const { registerMigrationHandlers } = await import("./migrations");
    registerMigrationHandlers();

    const wsServer = new WebSocketServer();
    await wsServer.start(Number(options.port), server);
  });

cli.help();
cli.version("1.0.0");
cli.parse();
