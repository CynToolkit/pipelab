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
  const cachePath = config?.cacheFolder || tmpdir();

  const abortController = new AbortController();

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
    context,
  });

  console.log(`Pipeline execution finished. Build ID: ${buildId}`);

  if (options.output) {
    const outputPath = isAbsolute(options.output)
      ? options.output
      : resolve(process.cwd(), options.output);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(`Result saved to ${outputPath}`);
  }

  return result;
}
