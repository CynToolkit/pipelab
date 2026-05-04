import { PipelabContext, setupConfigFile } from "@pipelab/core-node";
import { FileRepo, SaveLocation } from "@pipelab/shared";
import { readFile, unlink } from "node:fs/promises";
import { getDefaultUserDataPath } from "../paths";

export async function listPipelinesCommand(options: { userData?: string }) {
  const userDataPath = options.userData || getDefaultUserDataPath();
  const context = new PipelabContext({ userDataPath });

  try {
    const projectsConfig = await setupConfigFile<FileRepo>("projects", { context });
    const repo = await projectsConfig.getConfig();

    if (!repo.pipelines || repo.pipelines.length === 0) {
      console.log("No pipelines found.");
      return;
    }

    console.log(`Found ${repo.pipelines.length} pipelines:\n`);

    for (const pipeline of repo.pipelines) {
      let content: any;
      try {
        if (pipeline.type === "internal") {
          const path = context.getConfigPath(`${pipeline.configName}.json`);
          content = JSON.parse(await readFile(path, "utf-8"));
        } else if (pipeline.type === "external") {
          content = JSON.parse(await readFile(pipeline.path, "utf-8"));
        }
      } catch (e: any) {
        console.log(`--------------------------------------------------------------------------------`);
        console.log(`Error: Could not read pipeline ${pipeline.id}`);
        if (pipeline.type === "external") {
          console.log(`    Expected Path: ${pipeline.path}`);
        }
        console.log(`    Reason: ${e.message}`);
        continue;
      }

      const plugins = new Set<string>();
      if (content?.canvas?.blocks) {
        for (const block of content.canvas.blocks) {
          if (block.origin?.pluginId) {
            plugins.add(block.origin.pluginId);
          }
        }
      }

      const name = content?.name || "Unnamed Pipeline";

      console.log(`--------------------------------------------------------------------------------`);
      console.log(`${name} (${pipeline.id})`);
      if (pipeline.type === "external") {
        console.log(`   Path: ${pipeline.path}`);
      }
      console.log(`   Plugins: ${Array.from(plugins).join(", ") || "None"}`);
    }
  } catch (error: any) {
    console.error("Failed to list pipelines:", error.message);
  }
}

export async function showPipelineCommand(
  idOrName: string,
  options: { detailed?: boolean; userData?: string },
) {
  const userDataPath = options.userData || getDefaultUserDataPath();
  const context = new PipelabContext({ userDataPath });

  try {
    const projectsConfig = await setupConfigFile<FileRepo>("projects", { context });
    const repo = await projectsConfig.getConfig();

    const pipeline = repo.pipelines.find(
      (p) =>
        p.id === idOrName ||
        (p.type === "internal" && p.configName === idOrName) ||
        (p.type === "external" && p.path.includes(idOrName)),
    );

    if (!pipeline) {
      console.error(`Pipeline "${idOrName}" not found.`);
      process.exit(1);
    }

    let content: any;
    try {
      if (pipeline.type === "internal") {
        const path = context.getConfigPath(`${pipeline.configName}.json`);
        content = JSON.parse(await readFile(path, "utf-8"));
      } else if (pipeline.type === "external") {
        content = JSON.parse(await readFile(pipeline.path, "utf-8"));
      }
    } catch (e: any) {
      console.error(`Error: Could not read pipeline file: ${e.message}`);
      process.exit(1);
    }

    console.log(`\nPipeline: ${content?.name || "Unnamed"}`);
    console.log(`ID:       ${pipeline.id}`);
    console.log(`Type:     ${pipeline.type}`);
    if (pipeline.type === "external") {
      console.log(`Path:     ${pipeline.path}`);
    } else if (pipeline.type === "internal") {
      console.log(`Config:   ${pipeline.configName}.json`);
    }

    const plugins = new Set<string>();
    const blockCount = content?.canvas?.blocks?.length || 0;
    const triggerCount = content?.canvas?.triggers?.length || 0;

    if (content?.canvas?.blocks) {
      for (const block of content.canvas.blocks) {
        if (block.origin?.pluginId) {
          plugins.add(block.origin.pluginId);
        }
      }
    }

    console.log(`Plugins:  ${Array.from(plugins).join(", ") || "None"}`);
    console.log(`Blocks:   ${blockCount}`);
    console.log(`Triggers: ${triggerCount}`);

    if (options.detailed) {
      console.log(`\n--- Detailed Information ---`);
      console.log(`Version:  ${content?.version || "Unknown"}`);
      console.log(`Description: ${content?.description || "No description"}`);

      if (content?.variables && content.variables.length > 0) {
        console.log(`\nVariables:`);
        for (const v of content.variables) {
          console.log(` - ${v.name} (${v.type}): ${v.value}`);
        }
      } else {
        console.log(`\nVariables: None`);
      }

      if (content?.canvas?.blocks && content.canvas.blocks.length > 0) {
        console.log(`\nBlock Breakdown:`);
        const counts: Record<string, number> = {};
        for (const block of content.canvas.blocks) {
          const pid = block.origin?.pluginId || "core";
          counts[pid] = (counts[pid] || 0) + 1;
        }
        for (const [pid, count] of Object.entries(counts)) {
          console.log(` - ${pid}: ${count} blocks`);
        }
      }

      const triggers = content?.canvas?.triggers || [];
      const blocks = content?.canvas?.blocks || [];

      const humanize = (origin: any, customName?: string) => {
        if (customName) return customName;
        if (!origin) return "Unknown";
        const parts = origin.nodeId
          .split(":")
          .filter((p: string) => !(p.startsWith("v") && !isNaN(parseInt(p.substring(1)))));

        const nodeName = parts
          .map((p: string) => p.replace(/-/g, " ").replace(/_/g, " "))
          .map((p: string) => p.replace(/\b\w/g, (c: string) => c.toUpperCase()))
          .join(": ");

        return `${nodeName} [${origin.pluginId}]`;
      };

      console.log(`\nWorkflow:`);
      if (triggers.length > 0) {
        for (const t of triggers) {
          console.log(`  (Trigger) ${humanize(t.origin, t.name)}`);
        }
      } else {
        console.log(`  (No triggers defined)`);
      }

      if (blocks.length > 0) {
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          const status = b.disabled ? " [DISABLED]" : "";
          console.log(`      │`);
          console.log(`      ▼`);
          console.log(`  (Action)  ${humanize(b.origin, b.name)}${status}`);
          if (b.description) {
            console.log(`            ${b.description}`);
          }
        }
      } else {
        console.log(`      │`);
        console.log(`      ▼`);
        console.log(`  (No actions defined)`);
      }
    }
  } catch (error: any) {
    console.error("Failed to show pipeline:", error.message);
    process.exit(1);
  }
}

export async function deletePipelineCommand(
  id: string,
  options: { force?: boolean; userData?: string },
) {
  if (!options.force) {
    console.error(
      "This is a destructive operation. Please use the --force flag to confirm you want to delete the pipeline.",
    );
    process.exit(1);
  }

  const userDataPath = options.userData || getDefaultUserDataPath();
  const context = new PipelabContext({ userDataPath });

  try {
    const projectsConfig = await setupConfigFile<FileRepo>("projects", { context });
    const repo = await projectsConfig.getConfig();

    const index = repo.pipelines.findIndex(
      (p) => p.id === id || (p.type === "internal" && p.configName === id),
    );

    if (index === -1) {
      console.error(`Pipeline "${id}" not found.`);
      process.exit(1);
    }

    const pipeline = repo.pipelines[index] as SaveLocation;

    // 1. Delete internal file if applicable
    if (pipeline.type === "internal") {
      try {
        const path = context.getConfigPath(`${pipeline.configName}.json`);
        await unlink(path);
        console.log(`Deleted pipeline file: ${pipeline.configName}.json`);
      } catch (e: any) {
        if (e.code !== "ENOENT") {
          console.warn(`Warning: Could not delete pipeline file: ${e.message}`);
        }
      }
    }

    // 2. Remove from projects.json
    repo.pipelines.splice(index, 1);
    await projectsConfig.setConfig(repo);
    console.log(`Successfully removed pipeline "${id}" from Pipelab.`);
  } catch (error: any) {
    console.error("Failed to delete pipeline:", error.message);
    process.exit(1);
  }
}
