import { executeGraphWithHistory } from "./utils";
import { setupConfigFile } from "./config";
import { isDev, PipelabContext } from "./context";
import { readFile, access, writeFile, mkdir } from "node:fs/promises";
import { resolve, isAbsolute, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { savedFileMigrator } from "@pipelab/shared";
import type { AppConfig } from "@pipelab/shared";
import { registerMigrationHandlers } from "./migrations";
import { registerAllHandlers } from "./handlers/index";

export interface RunOptions {
  userData?: string;
  variables?: string;
  output?: string;
  cloud?: boolean;
}

export async function runPipelineCommand(file: string, options: RunOptions, version: string) {
  const pipelinePath = isAbsolute(file) ? file : resolve(process.cwd(), file);

  try {
    await access(pipelinePath);
  } catch (e) {
    throw new Error(`Pipeline file not found at ${pipelinePath}`);
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
    throw new Error("Pipeline does not contain a valid graph or canvas.blocks");
  }

  let vars = pipelineVariables || finalPipeline.variables || [];
  if (options.variables) {
    vars = JSON.parse(options.variables);
  }

  const effectiveProjectName = projectName || name || "CLI Run";
  const effectiveProjectPath = projectPath || process.cwd();
  const effectivePipelineId = pipelineId || "cli-run";

  console.log(`Executing pipeline: ${effectiveProjectName} (${effectivePipelineId})`);

  if (!options.userData) throw new Error("userDataPath is required for runPipelineCommand");
  const context = new PipelabContext({
    userDataPath: options.userData,
  });

  await registerAllHandlers({ version, context });
  registerMigrationHandlers(context);

  const settings = await setupConfigFile<AppConfig>("settings", { context });
  const config = await settings.getConfig();
  const cachePath = join(context.userDataPath, "cache");
  await mkdir(cachePath, { recursive: true });

  const abortController = new AbortController();

  let supabase: any;
  const cloudRunId = process.env.CLOUD_RUN_ID;
  if (options.cloud && cloudRunId) {
    const { createClient } = await import("@supabase/supabase-js");
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    console.log(`Cloud mode enabled. Streaming logs for run: ${cloudRunId}`);
  }

  try {
    const { result, buildId } = await executeGraphWithHistory({
      graph,
      variables: vars,
      projectName: effectiveProjectName,
      projectPath: effectiveProjectPath,
      pipelineId: effectivePipelineId,
      cachePath: cachePath,
      onNodeEnter: (node) => {
        console.log(`[ENTER] ${node.name} (${node.uid})`);
        if (supabase) {
          supabase
            .from("cloud_run_logs")
            .insert({
              run_id: cloudRunId,
              message: `[ENTER] ${node.name} (${node.uid})`,
              node_uid: node.uid,
              type: "node-enter",
            })
            .then();
        }
      },
      onNodeExit: (node) => {
        console.log(`[EXIT] ${node.name} (${node.uid})`);
        if (supabase) {
          supabase
            .from("cloud_run_logs")
            .insert({
              run_id: cloudRunId,
              message: `[EXIT] ${node.name} (${node.uid})`,
              node_uid: node.uid,
              type: "node-exit",
            })
            .then();
        }
      },
      onLog: (data, node) => {
        if (data.type === "log") {
          const message = data.data.message.join(" ");
          console.log(`[LOG] ${message}`);
          if (supabase) {
            supabase
              .from("cloud_run_logs")
              .insert({
                run_id: cloudRunId,
                message: message,
                node_uid: node?.uid,
                type: "log",
              })
              .then();
          }
        }
      },
      abortSignal: abortController.signal,
      context,
    });

    console.log(`Pipeline execution finished. Build ID: ${buildId}`);

    if (supabase) {
      await supabase.from("cloud_runs").update({ status: "success" }).eq("id", cloudRunId);
    }

    if (options.output) {
      const outputPath = isAbsolute(options.output)
        ? options.output
        : resolve(process.cwd(), options.output);

      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");
      console.log(`Result saved to ${outputPath}`);
    }

    return result;
  } catch (e) {
    if (supabase) {
      await supabase.from("cloud_runs").update({ status: "failed" }).eq("id", cloudRunId);
    }
    throw e;
  }
}
