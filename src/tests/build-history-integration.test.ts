import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBuildHistory } from '../renderer/store/build-history'
import { BuildHistoryStorage } from '../main/handlers/build-history'
import type { BuildHistoryEntry } from '../shared/build-history'
import { SubscriptionRequiredError } from '../shared/subscription-errors'

// Mock the auth store
vi.mock('../renderer/store/auth', () => ({
  useAuth: vi.fn(() => ({
    hasBenefit: vi.fn(() => true)
  }))
}))

// Mock logger
vi.mock('../shared/logger', () => ({
  useLogger: vi.fn(() => ({
    logger: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }))
  }))
}))

// Mock electron app and file system for storage tests
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  }
}))

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn()
}))

// Mock IPC for store tests
const mockIpcRenderer = {
  invoke: vi.fn()
}

Object.defineProperty(window, 'electron', {
  value: {
    ipcRenderer: mockIpcRenderer
  },
  writable: true
})

// Mock subscription errors
vi.mock('../shared/subscription-errors', () => ({
  isSubscriptionError: vi.fn((error) => error instanceof SubscriptionRequiredError),
  getSubscriptionErrorMessage: vi.fn(
    (error) => error?.userMessage || error?.message || 'An unknown error occurred'
  ),
  SubscriptionRequiredError: class MockSubscriptionRequiredError extends Error {
    code = 'SUBSCRIPTION_REQUIRED'
    benefit = 'build-history'
    userMessage = 'Build history requires a premium subscription'
    constructor(benefit?: string) {
      super('Subscription required')
      if (benefit) this.benefit = benefit
    }
  }
}))

describe('Build History Integration Tests', () => {
  let store: ReturnType<typeof useBuildHistory>
  let storage: BuildHistoryStorage
  let mockFs: any

  const createMockEntry = (overrides: Partial<BuildHistoryEntry> = {}): BuildHistoryEntry => ({
    id: 'test-entry-1',
    projectId: 'project-1',
    projectName: 'Test Project',
    projectPath: '/path/to/project',
    status: 'completed',
    startTime: Date.now() - 10000,
    endTime: Date.now(),
    duration: 10000,
    steps: [
      {
        id: 'step-1',
        name: 'Build Step',
        status: 'completed',
        startTime: Date.now() - 10000,
        endTime: Date.now(),
        duration: 10000,
        logs: [
          {
            id: 'log-1',
            timestamp: Date.now() - 10000,
            level: 'info',
            message: 'Build started'
          }
        ]
      }
    ],
    totalSteps: 1,
    completedSteps: 1,
    failedSteps: 0,
    cancelledSteps: 0,
    logs: [
      {
        id: 'log-1',
        timestamp: Date.now() - 10000,
        level: 'info',
        message: 'Build completed successfully'
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useBuildHistory()
    storage = new BuildHistoryStorage()
    mockFs = require('node:fs/promises')
    vi.clearAllMocks()

    // Setup default mocks
    mockFs.mkdir.mockResolvedValue(undefined)
    mockFs.writeFile.mockResolvedValue(undefined)
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({
        version: '1.0',
        lastUpdated: Date.now(),
        entries: {},
        projects: {}
      })
    )
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('End-to-End Build History Workflow', () => {
    it('should complete full build history lifecycle', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // 1. Create and save a build entry
      const entry = createMockEntry({
        id: 'workflow-test-1',
        status: 'running',
        projectName: 'Integration Test Project'
      })

      // Mock storage save
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('index.json')) {
          return Promise.resolve(
            JSON.stringify({
              version: '1.0',
              lastUpdated: Date.now(),
              entries: {},
              projects: {}
            })
          )
        }
        return Promise.reject(new Error('File not found'))
      })

      await storage.save(entry)

      // 2. Load entries in store
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [entry],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      await store.loadEntries()

      // 3. Verify entry is in store
      expect(store.entries).toHaveLength(1)
      expect(store.entries[0]).toEqual(entry)

      // 4. Update entry status
      const updatedEntry = { ...entry, status: 'completed' as const }
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('index.json')) {
          return Promise.resolve(
            JSON.stringify({
              version: '1.0',
              lastUpdated: Date.now(),
              entries: {
                'workflow-test-1': {
                  id: 'workflow-test-1',
                  projectId: 'project-1',
                  projectName: 'Integration Test Project',
                  status: 'running',
                  startTime: entry.startTime,
                  createdAt: entry.createdAt
                }
              },
              projects: {}
            })
          )
        }
        if (path.includes('entry-workflow-test-1.json')) {
          return Promise.resolve(JSON.stringify(updatedEntry))
        }
        return Promise.reject(new Error('File not found'))
      })

      await storage.update('workflow-test-1', { status: 'completed' })

      // 5. Refresh store data
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [updatedEntry],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      await store.loadEntries()

      // 6. Verify updated entry
      expect(store.entries[0].status).toBe('completed')

      // 7. Delete entry
      mockFs.unlink.mockResolvedValue(undefined)
      await storage.delete('workflow-test-1')

      // 8. Verify deletion
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0
      })

      await store.loadEntries()
      expect(store.entries).toHaveLength(0)
    })

    it('should handle multiple projects correctly', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Create entries for different projects
      const project1Entry = createMockEntry({
        id: 'project1-entry',
        projectId: 'project-1',
        projectName: 'Project Alpha'
      })

      const project2Entry = createMockEntry({
        id: 'project2-entry',
        projectId: 'project-2',
        projectName: 'Project Beta'
      })

      // Save both entries
      await storage.save(project1Entry)
      await storage.save(project2Entry)

      // Load all entries
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [project1Entry, project2Entry],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      await store.loadEntries()

      expect(store.entries).toHaveLength(2)
      expect(store.entries.map((e) => e.projectName)).toEqual(['Project Alpha', 'Project Beta'])

      // Delete by project
      mockFs.unlink.mockResolvedValue(undefined)
      await storage.deleteByProject('project-1')

      // Verify only project-1 entries are deleted
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [project2Entry],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      await store.loadEntries()
      expect(store.entries).toHaveLength(1)
      expect(store.entries[0].projectName).toBe('Project Beta')
    })

    it('should handle storage info correctly', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Create multiple entries
      const entries = [
        createMockEntry({ id: 'entry-1', createdAt: Date.now() - 86400000 }), // 1 day old
        createMockEntry({ id: 'entry-2', createdAt: Date.now() - 172800000 }), // 2 days old
        createMockEntry({ id: 'entry-3', createdAt: Date.now() }) // Recent
      ]

      for (const entry of entries) {
        await storage.save(entry)
      }

      // Mock file system for storage info
      mockFs.readdir.mockResolvedValue([
        'entry-entry-1.json',
        'entry-entry-2.json',
        'entry-entry-3.json',
        'index.json'
      ])
      mockFs.stat.mockImplementation((path: string) => {
        if (path.includes('entry-')) {
          return Promise.resolve({ size: 1024 })
        }
        if (path.includes('index.json')) {
          return Promise.resolve({ size: 256 })
        }
        return Promise.reject(new Error('File not found'))
      })

      const info = await storage.getStorageInfo()

      expect(info.totalEntries).toBe(3)
      expect(info.totalSize).toBe(3328) // 3 * 1024 + 256
      expect(info.oldestEntry).toBeDefined()
      expect(info.newestEntry).toBeDefined()
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    it('should handle corrupted storage gracefully', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Mock corrupted index file
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('index.json')) {
          return Promise.resolve('invalid json')
        }
        return Promise.reject(new Error('File not found'))
      })

      // Should not throw error and use default index
      await expect(storage.getAll()).resolves.toBeDefined()

      // Store should handle gracefully
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0
      })

      await store.loadEntries()
      expect(store.entries).toEqual([])
    })

    it('should handle network/IPC failures', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Mock IPC failure
      mockIpcRenderer.invoke.mockRejectedValue(new Error('Network error'))

      await expect(store.loadEntries()).rejects.toThrow('Network error')
      expect(store.error).toBe('Network error')
      expect(store.isLoading).toBe(false)
    })

    it('should handle subscription errors in workflow', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(false)

      // Try to use build history without subscription
      mockIpcRenderer.invoke.mockRejectedValue(new SubscriptionRequiredError('build-history'))

      await store.loadEntries()

      expect(store.hasSubscriptionError).toBe(true)
      expect(store.subscriptionError?.code).toBe('SUBSCRIPTION_REQUIRED')
      expect(store.isLoading).toBe(false)
    })
  })

  describe('Filtering and Pagination Integration', () => {
    it('should handle complex filtering scenarios', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Create entries with different statuses and projects
      const entries = [
        createMockEntry({ id: 'entry-1', status: 'completed' as const, projectName: 'Project A' }),
        createMockEntry({ id: 'entry-2', status: 'failed' as const, projectName: 'Project A' }),
        createMockEntry({ id: 'entry-3', status: 'completed' as const, projectName: 'Project B' }),
        createMockEntry({ id: 'entry-4', status: 'running' as const, projectName: 'Project B' })
      ]

      // Save all entries
      for (const entry of entries) {
        await storage.save(entry)
      }

      // Test status filter
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [entries[0], entries[2]], // Only completed entries
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      store.setFilters({ status: 'completed' })
      await store.loadEntries()

      expect(store.entries).toHaveLength(2)
      expect(store.entries.every((e) => e.status === 'completed')).toBe(true)

      // Test project name filter
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [entries[0]], // Only Project A completed entries
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      store.setFilters({ status: 'completed', projectName: 'Project A' })
      await store.loadEntries()

      expect(store.entries).toHaveLength(1)
      expect(store.entries[0].projectName).toBe('Project A')
    })

    it('should handle pagination correctly', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Create multiple entries
      const entries = Array.from({ length: 25 }, (_, i) =>
        createMockEntry({
          id: `entry-${i}`,
          projectName: `Project ${i}`,
          createdAt: Date.now() - i * 1000
        })
      )

      // Mock paginated response (page 1)
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: entries.slice(0, 20),
        total: 25,
        page: 1,
        pageSize: 20,
        totalPages: 2
      })

      store.setPagination({ page: 1, pageSize: 20 })
      await store.loadEntries()

      expect(store.entries).toHaveLength(20)
      expect(store.totalEntries).toBe(25)

      // Mock paginated response (page 2)
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: entries.slice(20, 25),
        total: 25,
        page: 2,
        pageSize: 20,
        totalPages: 2
      })

      store.setPagination({ page: 2, pageSize: 20 })
      await store.loadEntries()

      expect(store.entries).toHaveLength(5)
    })
  })

  describe('Retention Policy Integration', () => {
    it('should apply retention policy during save operations', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Create storage with strict retention policy
      const strictStorage = new BuildHistoryStorage({
        retentionPolicy: {
          enabled: true,
          maxEntries: 2,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          maxSize: 10 * 1024 * 1024,
          keepFailedBuilds: true,
          keepSuccessfulBuilds: true
        }
      })

      // Create old entries that should be cleaned up
      const now = Date.now()
      const oldEntry = createMockEntry({
        id: 'old-entry',
        createdAt: now - 10 * 24 * 60 * 60 * 1000, // 10 days old
        status: 'completed'
      })

      const recentEntry = createMockEntry({
        id: 'recent-entry',
        createdAt: now - 24 * 60 * 60 * 1000, // 1 day old
        status: 'completed'
      })

      // Mock existing entries in index
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('index.json')) {
          return Promise.resolve(
            JSON.stringify({
              version: '1.0',
              lastUpdated: now,
              entries: {
                'old-entry': {
                  id: 'old-entry',
                  projectId: 'project-1',
                  projectName: 'Test Project',
                  status: 'completed',
                  startTime: now - 10 * 24 * 60 * 60 * 1000,
                  createdAt: now - 10 * 24 * 60 * 60 * 1000
                }
              },
              projects: {}
            })
          )
        }
        if (path.includes('entry-old-entry.json')) {
          return Promise.resolve(JSON.stringify(oldEntry))
        }
        return Promise.reject(new Error('File not found'))
      })

      // Save new entry, should trigger retention policy
      await strictStorage.save(recentEntry)

      // Should delete old entry due to retention policy
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('entry-old-entry.json'))
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent save operations', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      const entries = [
        createMockEntry({ id: 'concurrent-1', projectName: 'Concurrent Project 1' }),
        createMockEntry({ id: 'concurrent-2', projectName: 'Concurrent Project 2' }),
        createMockEntry({ id: 'concurrent-3', projectName: 'Concurrent Project 3' })
      ]

      // Save entries concurrently
      await Promise.all(entries.map((entry) => storage.save(entry)))

      // Verify all entries were saved
      expect(mockFs.writeFile).toHaveBeenCalledTimes(6) // 3 entries + 3 index updates

      // Load all entries
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: entries,
        total: 3,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      await store.loadEntries()
      expect(store.entries).toHaveLength(3)
    })

    it('should handle concurrent read/write operations', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      const entry = createMockEntry({ id: 'concurrent-rw', projectName: 'Concurrent RW Test' })

      // Start read operation
      const readPromise = storage.getAll()

      // Start write operation simultaneously
      const writePromise = storage.save(entry)

      // Both should complete successfully
      await expect(readPromise).resolves.toBeDefined()
      await expect(writePromise).resolves.toBeUndefined()

      expect(mockFs.writeFile).toHaveBeenCalled()
    })
  })

  describe('Data Consistency', () => {
    it('should maintain data consistency across operations', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      const entry = createMockEntry({
        id: 'consistency-test',
        projectName: 'Consistency Test Project'
      })

      // Save entry
      await storage.save(entry)

      // Load and verify
      const loadedEntry = await storage.get('consistency-test')
      expect(loadedEntry).toEqual(entry)

      // Update entry
      const updates = { status: 'failed' as const }
      await storage.update('consistency-test', updates)

      // Load updated entry
      const updatedEntry = await storage.get('consistency-test')
      expect(updatedEntry?.status).toBe('failed')
      expect(updatedEntry?.updatedAt).toBeGreaterThan(entry.updatedAt)

      // Verify entry is still in the list
      const allEntries = await storage.getAll()
      expect(allEntries.entries).toHaveLength(1)
      expect(allEntries.entries[0]).toEqual(updatedEntry)
    })

    it('should handle storage corruption and recovery', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // First, save a valid entry
      const entry = createMockEntry({ id: 'recovery-test' })
      await storage.save(entry)

      // Simulate corruption by making readFile throw
      mockFs.readFile.mockRejectedValue(new Error('Disk error'))

      // Operations should handle gracefully
      const result = await storage.get('recovery-test')
      expect(result).toBeUndefined()

      // Clear should work even with corruption
      mockFs.readdir.mockResolvedValue(['entry-recovery-test.json', 'index.json'])
      mockFs.unlink.mockResolvedValue(undefined)

      await storage.clear()

      expect(mockFs.unlink).toHaveBeenCalledTimes(2)
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle large datasets efficiently', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Create many entries
      const entries = Array.from({ length: 100 }, (_, i) =>
        createMockEntry({
          id: `perf-entry-${i}`,
          projectName: `Performance Project ${i}`,
          createdAt: Date.now() - i * 1000
        })
      )

      // Mock large dataset response
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: entries.slice(0, 20), // First page
        total: 100,
        page: 1,
        pageSize: 20,
        totalPages: 5
      })

      const startTime = Date.now()
      await store.loadEntries()
      const endTime = Date.now()

      expect(store.entries).toHaveLength(20)
      expect(endTime - startTime).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle memory efficiently with large operations', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      // Test that large operations don't cause memory issues
      const largeEntry = createMockEntry({
        id: 'large-entry',
        logs: Array.from({ length: 1000 }, (_, i) => ({
          id: `log-${i}`,
          timestamp: Date.now() - i * 1000,
          level: 'info' as const,
          message: `Log message ${i}`
        })),
        steps: Array.from({ length: 100 }, (_, i) => ({
          id: `step-${i}`,
          name: `Step ${i}`,
          status: 'completed' as const,
          startTime: Date.now() - i * 1000,
          endTime: Date.now() - i * 900,
          duration: 100,
          logs: [] as any[]
        }))
      })

      await storage.save(largeEntry)

      // Should handle large entry without issues
      expect(mockFs.writeFile).toHaveBeenCalled()

      // Load should work with large entry
      mockIpcRenderer.invoke.mockResolvedValue({
        entries: [largeEntry],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      await store.loadEntries()
      expect(store.entries).toHaveLength(1)
    })
  })
})
