import { PipelabContext } from "../context";
import { join } from "node:path";
import { writeFile, readFile, unlink, mkdir, stat, readdir, rm } from "node:fs/promises";
import { useLogger, BuildHistoryEntry, IBuildHistoryStorage, AppConfig } from "@pipelab/shared";
import checkDiskSpace from "check-disk-space";
import { getFolderSize } from "../utils/fs-extras";
import { SandboxFolder } from "@pipelab/constants";

// Simplified storage - one file per pipeline containing array of build entries

export class BuildHistoryStorage implements IBuildHistoryStorage {
  private logger = useLogger();

  constructor(private context: PipelabContext) {
    // Simple initialization - no complex setup needed
  }

  private getStoragePath() {
    return this.context.getConfigPath("pipelines");
  }

  private getPipelinePath(pipelineId: string): string {
    return join(this.getStoragePath(), `${pipelineId}.history.json`);
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
        const pId = this.parsePipelineIdFromFilename(file);
        if (!pId) continue;
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
        const pipelineId = this.parsePipelineIdFromFilename(file);
        if (!pipelineId) continue;
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
          const pId = this.parsePipelineIdFromFilename(file);
          if (!pId) continue;
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
          const pId = this.parsePipelineIdFromFilename(file);
          if (!pId) continue;
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
      const cachePathsToDelete = new Set<string>();

      for (const file of files) {
        const pipelineId = this.parsePipelineIdFromFilename(file);
        if (pipelineId) {
          const entries = await this.loadPipelineHistory(pipelineId);
          for (const entry of entries) {
            if (entry.cachePath) {
              cachePathsToDelete.add(entry.cachePath);
            }
          }
          await rm(this.context.getArtifactsPath(pipelineId), { recursive: true, force: true }).catch(() => {});
        }
        await unlink(join(this.getStoragePath(), file));
      }

      this.logger.logger().info("Cleared all build history");

      for (const cachePath of cachePathsToDelete) {
        await rm(cachePath, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      this.logger.logger().error("Failed to clear build history:", error);
      throw new Error(`Failed to clear build history: ${error}`);
    }
  }

  async clearByPipeline(pipelineId: string): Promise<void> {
    try {
      const pipelinePath = this.getPipelinePath(pipelineId);
      const entries = await this.loadPipelineHistory(pipelineId);
      await unlink(pipelinePath);
      this.logger.logger().info(`Cleared history for pipeline "${pipelineId}"`);

      const cachePathsToDelete = new Set<string>();
      for (const entry of entries) {
        if (entry.cachePath) {
          cachePathsToDelete.add(entry.cachePath);
        }
      }
      for (const cachePath of cachePathsToDelete) {
        await rm(cachePath, { recursive: true, force: true }).catch(() => {});
      }
      await rm(this.context.getArtifactsPath(pipelineId), { recursive: true, force: true }).catch(() => {});
    } catch (error: any) {
      if (error.code === "ENOENT") {
        this.logger
          .logger()
          .warn(`No history file found for pipeline "${pipelineId}". Nothing to clear.`);
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
    userDataPath: string;
    disk: {
      total: number;
      free: number;
      pipelab: number;
      folders: Array<{ name: SandboxFolder; label: string; size: number }>;
    };
  }> {
    try {
      const allEntries = await this.getAll();
      const files = await this.getAllPipelineFiles();

      const diskSpace = await checkDiskSpace(this.context.userDataPath);
      const pipelabSize = await getFolderSize(this.context.userDataPath);

      const folders = [];
      for (const folder of this.context.getSandboxFolders()) {
        const size = await getFolderSize(folder.path);
        folders.push({
          name: folder.name,
          label: folder.label,
          size,
        });
      }

      if (allEntries.length === 0) {
        return {
          totalEntries: 0,
          totalSize: 0,
          numberOfPipelines: files.length,
          userDataPath: this.context.userDataPath,
          disk: {
            total: diskSpace.size,
            free: diskSpace.free,
            pipelab: pipelabSize,
            folders,
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
        userDataPath: this.context.userDataPath,
        disk: {
          total: diskSpace.size,
          free: diskSpace.free,
          pipelab: pipelabSize,
          folders,
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
      return files.filter((file) => file.endsWith(".history.json"));
    } catch (error) {
      return [];
    }
  }

  private parsePipelineIdFromFilename(filename: string): string | null {
    const match = filename.match(/^(.+)\.history\.json$/);
    return match ? match[1] : null;
  }
}
