#!/usr/bin/env node
import cac from "cac";
import { WebSocketServer, setAssetsPath, assetsPath, isDev } from "@pipelab/core-node";
import { registerAllHandlers } from "@pipelab/core-node";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import http from "http";
import handler from "serve-handler";
import type { AppConfig } from "@pipelab/shared";

console.log('cwd', process.cwd());
console.log('import.meta.url', import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
console.log('__dirname', __dirname);
setAssetsPath(join(__dirname, "..", "assets"));

const cli = cac("pipelab");

cli
  .command("serve", "Start the standalone WebSocket server")
  .option("-p, --port <port>", "Port to listen on", { default: 33753 })
  .option("--user-data <path>", "Custom user data path")
  .action(async (options) => {
    const uiPath = join(assetsPath, "ui");

    // Setup minimal context for headless mode
    // setAssetsPath already called at top level

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

    let finalPipeline = pipeline;
    if (pipeline.version) {
      const { savedFileMigrator } = await import("@pipelab/shared");
      finalPipeline = await savedFileMigrator.migrate(pipeline);
    }

    const {
      graph: rawGraph,
      variables: pipelineVariables,
      projectName,
      projectPath,
      pipelineId,
      canvas,
      name,
    } = finalPipeline;

    const graph = rawGraph || canvas?.blocks;

    if (!graph) {
      console.error("Error: Pipeline does not contain a valid graph or canvas.blocks");
      process.exit(1);
    }

    let vars = pipelineVariables || finalPipeline.variables || [];
    if (options.variables) {
      vars = JSON.parse(options.variables);
    }

    const effectiveProjectName = projectName || name || "CLI Run";
    const effectiveProjectPath = projectPath || process.cwd();
    const effectivePipelineId = pipelineId || "cli-run";

    console.log(`Executing pipeline: ${effectiveProjectName} (${effectivePipelineId})`);

    await registerAllHandlers();
    const { registerMigrationHandlers } = await import("./migrations");
    registerMigrationHandlers();

    const { executeGraphWithHistory, setupConfigFile } = await import("@pipelab/core-node");
    const settings = await setupConfigFile<AppConfig>("settings");
    const config = await settings.getConfig();
    const cachePath = config?.cacheFolder || (await import("node:os")).tmpdir();

    const abortController = new AbortController();

    try {
      const { result, buildId } = await executeGraphWithHistory({
        graph,
        variables: vars,
        projectName: effectiveProjectName,
        projectPath: effectiveProjectPath,
        pipelineId: effectivePipelineId,
        cachePath: cachePath,
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
      // console.log("Result:", JSON.stringify(result, null, 2));

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
