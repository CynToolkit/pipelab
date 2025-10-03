import { app } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises'
import { BuildHistoryEntry, IBuildHistoryStorage } from '@@/build-history'
import { useLogger } from '@@/logger'

// Simplified storage - one file per pipeline containing array of build entries
const STORAGE_PATH = join(app.getPath('userData'), 'build-history')

export class BuildHistoryStorage implements IBuildHistoryStorage {
  private logger = useLogger()

  constructor() {
    // Simple initialization - no complex setup needed
  }

  private getPipelinePath(pipelineId: string): string {
    // Sanitize the pipelineId to create a valid filename
    // Replace invalid filename characters with underscores
    const sanitizedId = pipelineId
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/__/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores

    return join(STORAGE_PATH, `pipeline-${sanitizedId}.json`)
  }

  private async ensureStoragePath(): Promise<void> {
    try {
      await mkdir(STORAGE_PATH, { recursive: true })
    } catch (error) {
      this.logger.logger().error('Failed to create storage path:', error)
      throw new Error(`Failed to create storage directory: ${error}`)
    }
  }

  private async loadPipelineHistory(pipelineId: string): Promise<BuildHistoryEntry[]> {
    try {
      const pipelinePath = this.getPipelinePath(pipelineId)
      const data = await readFile(pipelinePath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      // File doesn't exist or is corrupted, return empty array
      return []
    }
  }

  private async savePipelineHistory(
    pipelineId: string,
    entries: BuildHistoryEntry[]
  ): Promise<void> {
    console.log('savePipelineHistory', pipelineId, entries.length)
    try {
      await this.ensureStoragePath()
      const pipelinePath = this.getPipelinePath(pipelineId)
      await writeFile(pipelinePath, JSON.stringify(entries, null, 2), 'utf-8')
    } catch (error) {
      this.logger.logger().error('Failed to save pipeline history:', error)
      throw new Error(`Failed to save pipeline history: ${error}`)
    }
  }

  async save(entry: BuildHistoryEntry): Promise<void> {
    try {
      const entries = await this.loadPipelineHistory(entry.pipelineId)
      const existingIndex = entries.findIndex((e) => e.id === entry.id)

      if (existingIndex >= 0) {
        entries[existingIndex] = entry
      } else {
        entries.push(entry)
      }

      await this.savePipelineHistory(entry.pipelineId, entries)
      this.logger
        .logger()
        .info(`Saved build history entry: ${entry.id} for pipeline: ${entry.pipelineId}`)
    } catch (error) {
      this.logger.logger().error('Failed to save build history entry:', error)
      throw new Error(`Failed to save build history entry: ${error}`)
    }
  }

  async get(id: string): Promise<BuildHistoryEntry | undefined> {
    try {
      // We need to search through all pipeline files to find the entry
      // This is simple but not optimized - for production you'd want indexing
      const files = await this.getAllPipelineFiles()

      for (const file of files) {
        const pipelineId = file.replace('pipeline-', '').replace('.json', '')
        const entries = await this.loadPipelineHistory(pipelineId)

        const entry = entries.find((e) => e.id === id)
        if (entry) {
          return entry
        }
      }

      return undefined
    } catch (error) {
      this.logger.logger().error(`Failed to get build history entry ${id}:`, error)
      return undefined
    }
  }

  async getAll(): Promise<BuildHistoryEntry[]> {
    try {
      const files = await this.getAllPipelineFiles()
      const allEntries: BuildHistoryEntry[] = []

      for (const file of files) {
        const pipelineId = file.replace('pipeline-', '').replace('.json', '')
        const entries = await this.loadPipelineHistory(pipelineId)
        allEntries.push(...entries)
      }

      // Sort by creation time, newest first
      return allEntries.sort((a, b) => b.createdAt - a.createdAt)
    } catch (error) {
      this.logger.logger().error('Failed to get all build history entries:', error)
      throw new Error(`Failed to get build history entries: ${error}`)
    }
  }

  async getByPipeline(pipelineId: string): Promise<BuildHistoryEntry[]> {
    try {
      const entries = await this.loadPipelineHistory(pipelineId)
      // Sort by creation time, newest first
      return entries.sort((a, b) => b.createdAt - a.createdAt)
    } catch (error) {
      this.logger.logger().error(`Failed to get build history for pipeline ${pipelineId}:`, error)
      throw new Error(`Failed to get build history for pipeline: ${error}`)
    }
  }

  async update(id: string, updates: Partial<BuildHistoryEntry>): Promise<void> {
    try {
      const files = await this.getAllPipelineFiles()

      for (const file of files) {
        const pipelineId = file.replace('pipeline-', '').replace('.json', '')
        const entries = await this.loadPipelineHistory(pipelineId)

        const entryIndex = entries.findIndex((e) => e.id === id)
        if (entryIndex >= 0) {
          entries[entryIndex] = {
            ...entries[entryIndex],
            ...updates,
            updatedAt: Date.now()
          }
          await this.savePipelineHistory(pipelineId, entries)
          return
        }
      }

      throw new Error(`Build history entry ${id} not found`)
    } catch (error) {
      this.logger.logger().error(`Failed to update build history entry ${id}:`, error)
      throw new Error(`Failed to update build history entry: ${error}`)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const files = await this.getAllPipelineFiles()

      for (const file of files) {
        const pipelineId = file.replace('pipeline-', '').replace('.json', '')
        const entries = await this.loadPipelineHistory(pipelineId)

        const entryIndex = entries.findIndex((e) => e.id === id)
        if (entryIndex >= 0) {
          entries.splice(entryIndex, 1)
          await this.savePipelineHistory(pipelineId, entries)
          this.logger.logger().info(`Deleted build history entry: ${id}`)
          return
        }
      }

      // Entry not found, but don't throw error
      this.logger.logger().info(`Build history entry ${id} not found for deletion`)
    } catch (error) {
      this.logger.logger().error(`Failed to delete build history entry ${id}:`, error)
      throw new Error(`Failed to delete build history entry: ${error}`)
    }
  }

  async clear(): Promise<void> {
    try {
      await this.ensureStoragePath()

      const files = await this.getAllPipelineFiles()
      await Promise.all(files.map((file) => unlink(join(STORAGE_PATH, file))))

      this.logger.logger().info('Cleared all build history entries')
    } catch (error) {
      this.logger.logger().error('Failed to clear build history:', error)
      throw new Error(`Failed to clear build history: ${error}`)
    }
  }

  async getStorageInfo(): Promise<{
    totalEntries: number
    totalSize: number
    oldestEntry?: number
    newestEntry?: number
  }> {
    try {
      const allEntries = await this.getAll()
      if (allEntries.length === 0) {
        return {
          totalEntries: 0,
          totalSize: 0
        }
      }

      // Calculate approximate size
      let totalSize = 0
      try {
        const files = await this.getAllPipelineFiles()
        for (const file of files) {
          const filePath = join(STORAGE_PATH, file)
          const stats = await import('node:fs/promises').then((fs) => fs.stat(filePath))
          totalSize += stats.size
        }
      } catch (error) {
        // Rough estimate if we can't calculate actual size
        totalSize = allEntries.length * 1024
      }

      const sortedEntries = allEntries.sort((a, b) => a.createdAt - b.createdAt)

      return {
        totalEntries: allEntries.length,
        totalSize,
        oldestEntry: sortedEntries[0]?.createdAt,
        newestEntry: sortedEntries[sortedEntries.length - 1]?.createdAt
      }
    } catch (error) {
      this.logger.logger().error('Failed to get storage info:', error)
      throw new Error(`Failed to get storage info: ${error}`)
    }
  }

  private async getAllPipelineFiles(): Promise<string[]> {
    try {
      await this.ensureStoragePath()
      const files = await import('node:fs/promises').then((fs) => fs.readdir(STORAGE_PATH))
      return files.filter((file) => file.startsWith('pipeline-') && file.endsWith('.json'))
    } catch (error) {
      return []
    }
  }
}

// Export a default instance
export const buildHistoryStorage = new BuildHistoryStorage()
