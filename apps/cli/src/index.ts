#!/usr/bin/env node
import { isDev, serveCommand } from "@pipelab/core-node";
import { historyCommand } from "./commands/history";
import { usageCommand, purgeCommand } from "./commands/maintenance";
import { setupCommand } from "./commands/setup";
import { registerSettingsCommands } from "./commands/settings";
import {
  deleteWorkflowCommand,
  listWorkflowsCommand,
  workflowUserDataOption,
  runWorkflowCommand,
  workflowRunOptions,
} from "./commands/workflows";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSupabaseAvailable } from "@pipelab/shared";
import { config } from "dotenv";
import { PostHog } from "posthog-node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
process.env.PIPELAB_CLI_DIR ||= __dirname;

// Only load .env in development as values are bundled in production by tsdown
if (isDev) {
  const envPath = join(__dirname, "../../../.env");
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

const isProduction = !isDev && process.env.TEST !== "true";

let posthog: PostHog | undefined;
if (isProduction && process.env.POSTHOG_API_KEY) {
  posthog = new PostHog(process.env.POSTHOG_API_KEY, {
    host: "https://eu.i.posthog.com",
  });
}
import { Command } from "commander";
import { getDefaultUserDataPath } from "./paths";

// Resolve version from injected env or package.json. No "workspace"/"local"
// pseudo-versions: in dev the package.json lookup below resolves the real
// workspace version (apps/cli/package.json sits next to src/).
let version = process.env.CLI_VERSION || "0.0.0";
if (version === "0.0.0") {
  try {
    const packageJsonPath = existsSync(join(__dirname, "package.json"))
      ? join(__dirname, "package.json")
      : join(__dirname, "..", "package.json");

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      version = packageJson.version;
    }
  } catch (e) {
    console.warn("[CLI] Could not resolve version from package.json, using fallback.");
  }
}

const program = new Command();

program.name("pipelab").description("The command line interface for Pipelab").version(version);

if (!isSupabaseAvailable()) {
  console.warn(
    "\x1b[33m%s\x1b[0m",
    "Warning: Authentication is currently disabled (Cloud services not configured).",
  );
}

program
  .command("serve")
  .description("Start the standalone WebSocket server")
  .option("-p, --port <port>", "Port to listen on", "33753")
  .option("--host <host>", "Interface to bind to", "127.0.0.1")
  .option("--auth-token <token>", "Bearer token required for non-loopback access")
  .option("--allowed-origin <origin>", "Additional allowed browser origin")
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
  .command("history [project-id]")
  .description("View workflow run history for a project")
  .option("--get <build-id>", "Get a specific build entry by ID")
  .option("--user-data <path>", "Custom user data path")
  .option("--limit <number>", "Limit the number of history entries to show", "10")
  .action(async (projectId, options) => {
    try {
      await historyCommand(projectId, options);
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
  .command("purge [project-id]")
  .description("Purge build history")
  .option("--user-data <path>", "Custom user data path")
  .option("-f, --force", "Force the destructive operation")
  .action(async (projectId, options) => {
    try {
      await purgeCommand(projectId, options);
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

const workflows = program.command("workflow").alias("workflows").description("Manage workflows");

registerSettingsCommands(program);

workflows
  .command("ls")
  .alias("list")
  .description("List all workflows")
  .addOption(workflowUserDataOption())
  .action(async (options) => {
    try {
      await listWorkflowsCommand(options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

const workflowRun = workflows
  .command("run <id-or-name>")
  .description("Run a workflow from the default profile");
workflowRunOptions.forEach((option) => workflowRun.addOption(option));
workflowRun.action(async (id, options) => {
  try {
    await runWorkflowCommand(id, options);
  } catch (e) {
    console.error("Workflow execution failed:", e);
    process.exit(1);
  }
});

workflows
  .command("rm <id>")
  .alias("remove")
  .alias("delete")
  .description("Delete a workflow")
  .option("-f, --force", "Confirm deletion")
  .addOption(workflowUserDataOption())
  .action(async (id, options) => {
    try {
      await deleteWorkflowCommand(id, options);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program.hook("postAction", (thisCommand) => {
  if (posthog) {
    posthog.capture({
      distinctId: "cli-user",
      event: "command_executed",
      properties: {
        command: thisCommand.name(),
        args: thisCommand.args,
      },
    });
  }
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
