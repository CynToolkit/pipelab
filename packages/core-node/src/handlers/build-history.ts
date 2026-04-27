import { PipelabContext } from "../context";
import { join } from "node:path";
import { writeFile, readFile, unlink, mkdir, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { BuildHistoryEntry, IBuildHistoryStorage, AppConfig } from "@pipelab/shared";
import { useLogger } from "@pipelab/shared";
import { setupConfigFile } from "../config";

// Simplified storage - one file per pipeline containing array of build entries

export class BuildHistoryStorage implements IBuildHistoryStorage {
  private logger = useLogger();

  constructor(private context: PipelabContext) {
    // Simple initialization - no complex setup needed
  }

  private getStoragePath() {
    return join(this.context.userDataPath, "build-history");
  }

  private getPipelinePath(pipelineId: string): string {
    // Sanitize the pipelineId to create a valid filename
    // Replace invalid filename characters with underscores
    const sanitizedId = pipelineId
      .replace(/[/\:*?"<>|]/g, "_")
      .replace(/__/g, "_") // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores

    return join(this.getStoragePath(), `pipeline-${sanitizedId}.json`);
  }

  private async ensureStoragePath(): Promise<void> {
    try {
      await mkdir(this.getStoragePath(), { recursive: true });
    } catch (error) {
      this.logger.logger().error("Failed to create storage path:", error);
      throw new Error(`Failed to create storage directory: ${error}`);
    }
  }

  private async loadPipelineHistory(pipelineId: string): Promise<BuildHistoryEntry[]> {
    try {
      const pipelinePath = this.getPipelinePath(pipelineId);
      const data = await readFile(pipelinePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, return empty array
      return [];
    }
  }

  private async savePipelineHistory(
    pipelineId: string,
    entries: BuildHistoryEntry[],
  ): Promise<void> {
    try {
      await this.ensureStoragePath();
      const pipelinePath = this.getPipelinePath(pipelineId);
      await writeFile(pipelinePath, JSON.stringify(entries, null, 2), "utf-8");
    } catch (error) {
      this.logger.logger().error("Failed to save pipeline history:", error);
      throw new Error(`Failed to save pipeline history: ${error}`);
    }
  }

  async applyRetentionPolicy(): Promise<void> {
    try {
      this.logger.logger().info("Applying build history retention policy...");
      const settings = await setupConfigFile<AppConfig>("settings", { context: this.context });
      const config = await settings.getConfig();
      const policy = config?.buildHistory?.retentionPolicy;

      if (!policy || !policy.enabled) {
        this.logger.logger().info("Retention policy is disabled. Skipping.");
        return;
      }

      const { maxAge, maxEntries } = policy;
      const pipelineFiles = await this.getAllPipelineFiles();

      for (const file of pipelineFiles) {
        const pipelineId = file.replace("pipeline-", "").replace(".json", "");
        let entries = await this.loadPipelineHistory(pipelineId);
        const originalCount = entries.length;

        // 1. Filter by maxAge
        if (maxAge > 0) {
          const minDate = Date.now() - maxAge * 24 * 60 * 60 * 1000;
          entries = entries.filter((entry) => entry.createdAt >= minDate);
        }

        // 2. Filter by maxEntries (sort by date first to keep the newest)
        if (maxEntries > 0 && entries.length > maxEntries) {
          entries = entries
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, maxEntries);
        }

        if (entries.length < originalCount) {
          this.logger
            .logger()
            .info(
              `[${pipelineId}] Pruned ${originalCount - entries.length} history entries.`,
            );
          await this.savePipelineHistory(pipelineId, entries);
        }
      }
      this.logger.logger().info("Retention policy applied successfully.");
    } catch (error) {
      this.logger.logger().error("Failed to apply retention policy:", error);
      // We don't re-throw here as this is a background task and shouldn't crash the app
    }
  }

  async save(entry: BuildHistoryEntry): Promise<void> {
    try {
      const entries = await this.loadPipelineHistory(entry.pipelineId);
      const existingIndex = entries.findIndex((e) => e.id === entry.id);

      if (existingIndex >= 0) {
        entries[existingIndex] = entry;
      } else {
        entries.push(entry);
      }

      await this.savePipelineHistory(entry.pipelineId, entries);
      this.logger
        .logger()
        .info(`Saved build history entry: ${entry.id} for pipeline: ${entry.pipelineId}`);
    } catch (error) {
      this.logger.logger().error("Failed to save build history entry:", error);
      throw new Error(`Failed to save build history entry: ${error}`);
    }
  }

  async get(id: string, pipelineId?: string): Promise<BuildHistoryEntry | undefined> {
    try {
      if (pipelineId) {
        const entries = await this.loadPipelineHistory(pipelineId);
        return entries.find((e) => e.id === id);
      }

      const files = await this.getAllPipelineFiles();
      for (const file of files) {
        const pId = file.replace("pipeline-", "").replace(".json", "");
        const entries = await this.loadPipelineHistory(pId);
        const entry = entries.find((e) => e.id === id);
        if (entry) return entry;
      }
      return undefined;
    } catch (error) {
      this.logger.logger().error(`Failed to get build history entry ${id}:`, error);
      return undefined;
    }
  }

  async getAll(): Promise<BuildHistoryEntry[]> {
    try {
      const files = await this.getAllPipelineFiles();
      const allEntries: BuildHistoryEntry[] = [];
      for (const file of files) {
        const pipelineId = file.replace("pipeline-", "").replace(".json", "");
        const entries = await this.loadPipelineHistory(pipelineId);
        allEntries.push(...entries);
      }
      return allEntries.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      this.logger.logger().error("Failed to get all build history entries:", error);
      throw new Error(`Failed to get all build history entries: ${error}`);
    }
  }

  async getByPipeline(pipelineId: string): Promise<BuildHistoryEntry[]> {
    try {
      const entries = await this.loadPipelineHistory(pipelineId);
      return entries.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      this.logger.logger().error(`Failed to get build history for pipeline ${pipelineId}:`, error);
      throw new Error(`Failed to get build history for pipeline: ${error}`);
    }
  }

  async update(
    id: string,
    updates: Partial<BuildHistoryEntry>,
    pipelineId?: string,
  ): Promise<void> {
    try {
      if (pipelineId) {
        const entries = await this.loadPipelineHistory(pipelineId);
        const entryIndex = entries.findIndex((e) => e.id === id);
        if (entryIndex >= 0) {
          entries[entryIndex] = { ...entries[entryIndex], ...updates, updatedAt: Date.now() };
          await this.savePipelineHistory(pipelineId, entries);
          return;
        }
      } else {
        const files = await this.getAllPipelineFiles();
        for (const file of files) {
          const pId = file.replace("pipeline-", "").replace(".json", "");
          const entries = await this.loadPipelineHistory(pId);
          const entryIndex = entries.findIndex((e) => e.id === id);
          if (entryIndex >= 0) {
            entries[entryIndex] = { ...entries[entryIndex], ...updates, updatedAt: Date.now() };
            await this.savePipelineHistory(pId, entries);
            return;
          }
        }
      }
      throw new Error(`Build history entry ${id} not found`);
    } catch (error) {
      this.logger.logger().error(`Failed to update build history entry ${id}:`, error);
      throw new Error(`Failed to update build history entry: ${error}`);
    }
  }

  async delete(id: string, pipelineId?: string): Promise<void> {
    try {
      if (pipelineId) {
        const entries = await this.loadPipelineHistory(pipelineId);
        const entryIndex = entries.findIndex((e) => e.id === id);
        if (entryIndex >= 0) {
          entries.splice(entryIndex, 1);
          await this.savePipelineHistory(pipelineId, entries);
          this.logger.logger().info(`Deleted build history entry: ${id}`);
          return;
        }
      } else {
        const files = await this.getAllPipelineFiles();
        for (const file of files) {
          const pId = file.replace("pipeline-", "").replace(".json", "");
          const entries = await this.loadPipelineHistory(pId);
          const entryIndex = entries.findIndex((e) => e.id === id);
          if (entryIndex >= 0) {
            entries.splice(entryIndex, 1);
            await this.savePipelineHistory(pId, entries);
            this.logger.logger().info(`Deleted build history entry: ${id}`);
            return;
          }
        }
      }
      this.logger.logger().info(`Build history entry ${id} not found for deletion`);
    } catch (error) {
      this.logger.logger().error(`Failed to delete build history entry ${id}:`, error);
      throw new Error(`Failed to delete build history entry: ${error}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.ensureStoragePath();
      const files = await this.getAllPipelineFiles();
      await Promise.all(files.map((file) => unlink(join(this.getStoragePath(), file))));
      this.logger.logger().info("Cleared all build history");
    } catch (error) {
      this.logger.logger().error("Failed to clear build history:", error);
      throw new Error(`Failed to clear build history: ${error}`);
    }
  }

  async clearByPipeline(pipelineId: string): Promise<void> {
    try {
      const pipelinePath = this.getPipelinePath(pipelineId);
      await unlink(pipelinePath);
      this.logger.logger().info(`Cleared history for pipeline "${pipelineId}"`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.logger().warn(`No history file found for pipeline "${pipelineId}". Nothing to clear.`);
        return;
      }
      this.logger.logger().error(`Failed to clear history for pipeline "${pipelineId}":`, error);
      throw new Error(`Failed to clear history for pipeline: ${error}`);
    }
  }

  async getStorageInfo(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry?: number;
    newestEntry?: number;
    numberOfPipelines: number;
    cachePath: string;
    userDataPath: string;
    retentionPolicy: {
      enabled: boolean;
      maxEntries: number;
      maxAge: number;
    };
  }> {
    try {
      const allEntries = await this.getAll();
      const files = await this.getAllPipelineFiles();

      const settings = await setupConfigFile<AppConfig>("settings", { context: this.context });
      const config = await settings.getConfig();
      const policy = config?.buildHistory?.retentionPolicy || {
        enabled: false,
        maxEntries: 0,
        maxAge: 0,
      };

      if (allEntries.length === 0) {
        return {
          totalEntries: 0,
          totalSize: 0,
          numberOfPipelines: files.length,
          cachePath: config?.cacheFolder || tmpdir(),
          userDataPath: this.context.userDataPath,
          retentionPolicy: {
            enabled: policy.enabled,
            maxEntries: policy.maxEntries,
            maxAge: policy.maxAge,
          },
        };
      }

      let totalSize = 0;
      try {
        for (const file of files) {
          const filePath = join(this.getStoragePath(), file);
          const stats = await stat(filePath);
          totalSize += stats.size;
        }
      } catch (error) {
        totalSize = allEntries.length * 1024; // Rough estimate
      }

      const sortedEntries = allEntries.sort((a, b) => a.createdAt - b.createdAt);

      return {
        totalEntries: allEntries.length,
        totalSize,
        oldestEntry: sortedEntries[0]?.createdAt,
        newestEntry: sortedEntries[sortedEntries.length - 1]?.createdAt,
        numberOfPipelines: files.length,
        cachePath: config?.cacheFolder || tmpdir(),
        userDataPath: this.context.userDataPath,
        retentionPolicy: {
          enabled: policy.enabled,
          maxEntries: policy.maxEntries,
          maxAge: policy.maxAge,
        },
      };
    } catch (error) {
      this.logger.logger().error("Failed to get storage info:", error);
      throw new Error(`Failed to get storage info: ${error}`);
    }
  }

  private async getAllPipelineFiles(): Promise<string[]> {
    try {
      await this.ensureStoragePath();
      const files = await readdir(this.getStoragePath());
      return files.filter((file) => file.startsWith("pipeline-") && file.endsWith(".json"));
    } catch (error) {
      return [];
    }
  }
}
