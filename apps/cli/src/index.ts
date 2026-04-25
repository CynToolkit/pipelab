#!/usr/bin/env node
import { isDev, runPipelineCommand, serveCommand } from "@pipelab/core-node";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import cac from "cac";
import { getDefaultUserDataPath } from "./paths";

if (!isDev && process.env.TEST !== "true") {
  Sentry.init({
    dsn: "https://757630879674735027fa5700162253f7@o45694.ingest.us.sentry.io/4507621723144192",
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;

const cli = cac("pipelab");

cli
  .command("serve", "Start the standalone WebSocket server")
  .option("-p, --port <port>", "Port to listen on", { default: 33753 })
  .option("--user-data <path>", "Custom user data path")
  .action(async (options) => {
    try {
      options.userData = options.userData || getDefaultUserDataPath();
      await serveCommand(options, version, __dirname);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

cli
  .command("run <file>", "Run a pipeline from a JSON file")
  .option("--user-data <path>", "Custom user data path")
  .option("--variables <json>", "JSON string of variables to override")
  .option("-o, --output <path>", "Path to write the result file")
  .action(async (file, options) => {
    try {
      options.userData = options.userData || getDefaultUserDataPath();
      await runPipelineCommand(file, options, version);
      process.exit(0);
    } catch (e) {
      console.error("Pipeline execution failed:", e);
      process.exit(1);
    }
  });

cli.help();
cli.version(version);

const parsed = cli.parse();

if (!parsed.args.length && !process.argv.slice(2).length) {
  cli.outputHelp();
}
