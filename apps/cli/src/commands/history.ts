import { PipelabContext, BuildHistoryStorage } from "@pipelab/core-node";
import { getDefaultUserDataPath } from "../paths";
import { BuildHistoryEntry } from "@pipelab/shared";

export async function historyCommand(
  pipelineId: string | undefined,
  options: { get?: string; userData?: string; limit?: number },
) {
  const userDataPath = options.userData || getDefaultUserDataPath();
  const context = new PipelabContext({ userDataPath });
  const storage = new BuildHistoryStorage(context);

  if (options.get) {
    const entry = await storage.get(options.get, pipelineId);
    if (entry) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.error(`Build history entry with ID "${options.get}" not found.`);
      process.exit(1);
    }
  } else if (pipelineId) {
    const entries = await storage.getByPipeline(pipelineId);
    if (entries.length > 0) {
      const limit = options.limit || 10;
      const recentEntries = entries.slice(-limit);

      const formatted = recentEntries.map((e: BuildHistoryEntry) => ({
        ID: e.id,
        Status: e.status,
        "Start Time": new Date(e.startTime).toLocaleString(),
        Duration: e.duration ? `${(e.duration / 1000).toFixed(2)}s` : "N/A",
      }));
      console.table(formatted);
    } else {
      console.log(`No history found for pipeline "${pipelineId}".`);
    }
  } else {
    console.error(
      "Please provide a pipeline ID to list its history, or use the --get option with a build ID.",
    );
    process.exit(1);
  }
}
