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

cli
  .command("run <file>", "Run a pipeline from a JSON file")
  .option("--user-data <path>", "Custom user data path")
  .option("--variables <json>", "JSON string of variables to override")
  .option("-o, --output <path>", "Path to write the result file")
  .action(async (file, options) => {
    const { readFile, access, writeFile, mkdir } = await import("node:fs/promises");
    const { resolve, isAbsolute, dirname } = await import("node:path");

    const pipelinePath = isAbsolute(file) ? file : resolve(process.cwd(), file);

    try {
      await access(pipelinePath);
    } catch (e) {
      console.error(`Error: Pipeline file not found at ${pipelinePath}`);
      process.exit(1);
    }

    const pipelineContent = await readFile(pipelinePath, "utf-8");
    const pipeline = JSON.parse(pipelineContent);

    const { graph, variables: pipelineVariables, projectName, projectPath, pipelineId } = pipeline;

    const vars = options.variables ? JSON.parse(options.variables) : pipelineVariables || [];

    console.log(`Executing pipeline: ${projectName || "Unnamed Project"} (${pipelineId || "no-id"})`);

    await registerAllHandlers();
    const { registerMigrationHandlers } = await import("./migrations");
    registerMigrationHandlers();

    const { executeGraphWithHistory } = await import("@pipelab/core-node");

    const abortController = new AbortController();

    try {
      const { result, buildId } = await executeGraphWithHistory({
        graph,
        variables: vars,
        projectName: projectName || "CLI Run",
        projectPath: projectPath || process.cwd(),
        pipelineId: pipelineId || "cli-run",
        onNodeEnter: (node) => console.log(`[ENTER] ${node.name} (${node.uid})`),
        onNodeExit: (node) => console.log(`[EXIT] ${node.name} (${node.uid})`),
        onLog: (data) => {
          if (data.type === "log") {
            console.log(`[LOG] ${data.data.message}`);
          }
        },
        abortSignal: abortController.signal,
      });

      console.log(`Pipeline execution finished. Build ID: ${buildId}`);
      console.log("Result:", JSON.stringify(result, null, 2));

      if (options.output) {
        const outputPath = isAbsolute(options.output)
          ? options.output
          : resolve(process.cwd(), options.output);

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");
        console.log(`Result saved to ${outputPath}`);
      }

      process.exit(0);
    } catch (e) {
      console.error("Pipeline execution failed:", e);
      process.exit(1);
    }
  });

cli.help();
cli.version("1.0.0");
cli.parse();
