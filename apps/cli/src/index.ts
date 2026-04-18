#!/usr/bin/env node
import {
  webSocketServer,
  isDev,
  registerAllHandlers,
  executeGraphWithHistory,
  setupConfigFile,
  userDataPath,
  fetchPipelabAsset,
} from "@pipelab/core-node";
import { existsSync, readFileSync } from "node:fs";
import { readFile, access, writeFile, mkdir } from "node:fs/promises";
import { resolve, isAbsolute, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { savedFileMigrator } from "@pipelab/shared";
import { registerMigrationHandlers } from "./migrations";
import * as Sentry from "@sentry/node";

if (!isDev && process.env.TEST !== "true") {
  Sentry.init({
    dsn: "https://757630879674735027fa5700162253f7@o45694.ingest.us.sentry.io/4507621723144192",
  });
}

import cac from "cac";
import http from "http";
import handler from "serve-handler";
import type { AppConfig } from "@pipelab/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("cwd", process.cwd());
console.log("import.meta.url", import.meta.url);
console.log("__dirname", __dirname);

const cli = cac("pipelab");

cli
  .command("serve", "Start the standalone WebSocket server")
  .option("-p, --port <port>", "Port to listen on", { default: 33753 })
  .option("--user-data <path>", "Custom user data path")
  .action(async (options) => {
    let rawAssetFolder: string | undefined;
    if (!isDev) {
      rawAssetFolder = await fetchPipelabAsset("@pipelab/ui");
    }

    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    const version = packageJson.version;

    // Setup minimal context for headless mode
    // setAssetsPath already called at top level

    console.log("isDev", isDev);

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

    await registerAllHandlers({ version });
    registerMigrationHandlers();

    await webSocketServer.start(Number(options.port), server);
  });

cli
  .command("run <file>", "Run a pipeline from a JSON file")
  .option("--user-data <path>", "Custom user data path")
  .option("--variables <json>", "JSON string of variables to override")
  .option("-o, --output <path>", "Path to write the result file")
  .action(async (file, options) => {
    const pipelinePath = isAbsolute(file) ? file : resolve(process.cwd(), file);

    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    const version = packageJson.version;

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

    await registerAllHandlers({ version });
    registerMigrationHandlers();

    const settings = await setupConfigFile<AppConfig>("settings");
    const config = await settings.getConfig();
    const cachePath = config?.cacheFolder || tmpdir();

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

const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
cli.version(packageJson.version);

const parsed = cli.parse();

if (!parsed.args.length && !process.argv.slice(2).length) {
  cli.outputHelp();
}
