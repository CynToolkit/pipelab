import { PipelabContext, BuildHistoryStorage } from "@pipelab/core-node";
import { getDefaultUserDataPath } from "../paths";

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export async function usageCommand(options: { userData?: string }) {
  const userDataPath = options.userData || getDefaultUserDataPath();
  const context = new PipelabContext({ userDataPath });
  const storage = new BuildHistoryStorage(context);

  const info = await storage.getStorageInfo();

  console.log("Build History Storage Usage:");
  console.table({
    "Total Entries": info.totalEntries,
    "Pipelines with History": info.numberOfPipelines,
    "Total Size": formatBytes(info.totalSize),
    "Oldest Entry": info.oldestEntry ? new Date(info.oldestEntry).toLocaleString() : "N/A",
    "Newest Entry": info.newestEntry ? new Date(info.newestEntry).toLocaleString() : "N/A",
    "User Data Path": info.userDataPath,
    "Cache Path": info.cachePath,
  });

  console.log("\nRetention Policy:");
  console.table({
    Enabled: info.retentionPolicy.enabled ? "Yes" : "No",
    "Max Entries": info.retentionPolicy.maxEntries > 0 ? info.retentionPolicy.maxEntries : "Unlimited",
    "Max Age (days)": info.retentionPolicy.maxAge > 0 ? info.retentionPolicy.maxAge : "Unlimited",
  });
}

export async function purgeCommand(
  pipelineId: string | undefined,
  options: { force?: boolean; userData?: string },
) {
  if (!options.force) {
    console.error(
      "This is a destructive operation. Please use the --force flag to confirm you want to purge the history.",
    );
    process.exit(1);
  }

  const userDataPath = options.userData || getDefaultUserDataPath();
  const context = new PipelabContext({ userDataPath });
  const storage = new BuildHistoryStorage(context);

  if (pipelineId) {
    await storage.clearByPipeline(pipelineId);
    console.log(`Successfully purged history for pipeline: ${pipelineId}`);
  } else {
    await storage.clear();
    console.log("Successfully purged all build history.");
  }
}
