#!/usr/bin/env node
import { isDev, runPipelineCommand, serveCommand } from "@pipelab/core-node";
import { historyCommand } from "./commands/history";
import { usageCommand, purgeCommand } from "./commands/maintenance";
import {
  listPipelinesCommand,
  deletePipelineCommand,
  showPipelineCommand,
} from "./commands/pipelines";
import { setupCommand } from "./commands/setup";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { Command } from "commander";
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

const program = new Command();

program
  .name("pipelab")
  .description("The command line interface for Pipelab")
  .version(version);

program
  .command("serve")
  .description("Start the standalone WebSocket server")
  .option("-p, --port <port>", "Port to listen on", "33753")
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

program
  .command("run <file>")
  .description("Run a pipeline from a JSON file")
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

program
  .command("history [pipeline-id]")
  .description("View build history for a pipeline")
  .option("--get <build-id>", "Get a specific build entry by ID")
  .option("--user-data <path>", "Custom user data path")
  .option("--limit <number>", "Limit the number of history entries to show", "10")
  .action(async (pipelineId, options) => {
    try {
      await historyCommand(pipelineId, options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command("usage")
  .description("Show build history storage usage")
  .option("--user-data <path>", "Custom user data path")
  .action(async (options) => {
    try {
      await usageCommand(options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command("purge [pipeline-id]")
  .description("Purge build history")
  .option("--user-data <path>", "Custom user data path")
  .option("-f, --force", "Force the destructive operation")
  .action(async (pipelineId, options) => {
    try {
      await purgeCommand(pipelineId, options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command("setup")
  .description("Run the interactive setup wizard")
  .option("--user-data <path>", "Custom user data path")
  .action(async (options) => {
    try {
      await setupCommand(options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

const pipelines = program
  .command("pipelines")
  .alias("pipeline")
  .description("Manage pipelines");

pipelines
  .command("ls")
  .alias("list")
  .description("List all pipelines")
  .option("--user-data <path>", "Custom user data path")
  .action(async (options) => {
    try {
      await listPipelinesCommand(options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

pipelines
  .command("show <id-or-name>")
  .alias("shw")
  .description("Display basic information about a pipeline")
  .option("--user-data <path>", "Custom user data path")
  .action(async (idOrName, options) => {
    try {
      await showPipelineCommand(idOrName, { ...options, detailed: false });
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

pipelines
  .command("detail <id-or-name>")
  .alias("details")
  .description("Display detailed information about a pipeline")
  .option("--user-data <path>", "Custom user data path")
  .action(async (idOrName, options) => {
    try {
      await showPipelineCommand(idOrName, { ...options, detailed: true });
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

pipelines
  .command("rm <id>")
  .alias("remove")
  .alias("delete")
  .description("Delete a pipeline")
  .option("--user-data <path>", "Custom user data path")
  .option("-f, --force", "Force the destructive operation")
  .action(async (id, options) => {
    try {
      await deletePipelineCommand(id, options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
