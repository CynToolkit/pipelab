import { rm } from 'node:fs/promises'

class TempFolderTracker {
  private folders: Set<string> = new Set()
  private static instance: TempFolderTracker

  private constructor() {}

  public static getInstance(): TempFolderTracker {
    if (!TempFolderTracker.instance) {
      TempFolderTracker.instance = new TempFolderTracker()
    }
    return TempFolderTracker.instance
  }

  public track(folder: string): void {
    this.folders.add(folder)
  }

  public async cleanup(force: boolean = false): Promise<void> {
    if (this.folders.size === 0) return

    const foldersToDelete = Array.from(this.folders)
    this.folders.clear()

    for (const folder of foldersToDelete) {
      try {
        console.info(`Deleting temporary folder: ${folder}`)
        // await rm(folder, { recursive: true, force })
      } catch (error) {
        console.error(`Failed to delete temporary folder: ${folder}`, error)
        // Re-add the folder if deletion failed
        if (!force) {
          this.folders.add(folder)
        }
      }
    }
  }

  public getTrackedFolders(): string[] {
    return Array.from(this.folders)
  }
}

export const tempFolderTracker = TempFolderTracker.getInstance()
