import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBuildHistory } from '../renderer/store/build-history'
import type { BuildHistoryEntry, BuildHistoryQuery } from '../shared/build-history'
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

// Mock electron IPC
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

describe('Build History Store', () => {
  let store: ReturnType<typeof useBuildHistory>

  const mockEntry: BuildHistoryEntry = {
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
    updatedAt: Date.now()
  }

  const mockResponse = {
    entries: [mockEntry],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useBuildHistory()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Initial State', () => {
    it('should initialize with correct default state', () => {
      expect(store.entries).toEqual([])
      expect(store.currentEntry).toBeUndefined()
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeUndefined()
      expect(store.subscriptionError).toBeUndefined()
      expect(store.storageInfo).toBeUndefined()
      expect(store.hasEntries).toBe(false)
      expect(store.totalEntries).toBe(0)
      expect(store.isPaidUser).toBe(true) // Mocked to return true
      expect(store.hasSubscriptionError).toBe(false)
    })

    it('should initialize filters and pagination with defaults', () => {
      expect(store.filters).toEqual({})
      expect(store.pagination).toEqual({
        page: 1,
        pageSize: 20,
        sortBy: 'startTime',
        sortOrder: 'desc'
      })
    })
  })

  describe('Authorization', () => {
    it('should check authorization before operations', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(false)

      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: 'Subscription required'
      })

      // Try to load entries without authorization
      await store.loadEntries()

      expect(store.hasSubscriptionError).toBe(true)
      expect(store.subscriptionError?.code).toBe('SUBSCRIPTION_REQUIRED')
      expect(store.isLoading).toBe(false)
    })

    it('should allow operations for authorized users', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)

      mockIpcRenderer.invoke.mockResolvedValue(mockResponse)

      await store.loadEntries()

      expect(store.hasSubscriptionError).toBe(false)
      expect(store.entries).toEqual([mockEntry])
    })
  })

  describe('Load Entries', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should load entries successfully', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockResponse)

      await store.loadEntries()

      expect(store.entries).toEqual([mockEntry])
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeUndefined()
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:get-all', {
        query: {
          filters: {},
          pagination: {
            page: 1,
            pageSize: 20,
            sortBy: 'startTime',
            sortOrder: 'desc'
          }
        }
      })
    })

    it('should handle load errors', async () => {
      const errorMessage = 'Failed to load entries'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.loadEntries()).rejects.toThrow(errorMessage)

      expect(store.entries).toEqual([])
      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })

    it('should handle subscription errors specifically', async () => {
      const subscriptionError = new SubscriptionRequiredError('build-history')
      mockIpcRenderer.invoke.mockRejectedValue(subscriptionError)

      await store.loadEntries()

      expect(store.hasSubscriptionError).toBe(true)
      expect(store.subscriptionError?.code).toBe('SUBSCRIPTION_REQUIRED')
      expect(store.isLoading).toBe(false)
    })

    it('should load entries with custom query', async () => {
      const customQuery: BuildHistoryQuery = {
        filters: { status: 'completed' },
        pagination: { page: 2, pageSize: 10 }
      }

      mockIpcRenderer.invoke.mockResolvedValue(mockResponse)

      await store.loadEntries(customQuery)

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:get-all', {
        query: customQuery
      })
    })

    it('should update storage info when loading entries', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockResponse)

      await store.loadEntries()

      expect(store.storageInfo).toBeDefined()
      expect(store.storageInfo?.totalEntries).toBe(1)
    })
  })

  describe('Load Single Entry', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should load a single entry successfully', async () => {
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'success',
        entry: mockEntry
      })

      const result = await store.loadEntry('test-entry-1')

      expect(result).toEqual(mockEntry)
      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.isLoading).toBe(false)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:get', {
        id: 'test-entry-1'
      })
    })

    it('should update entry in entries list when loading', async () => {
      // First load some entries
      mockIpcRenderer.invoke.mockResolvedValueOnce(mockResponse)
      await store.loadEntries()

      // Then load a specific entry
      const updatedEntry = { ...mockEntry, status: 'failed' }
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'success',
        entry: updatedEntry
      })

      await store.loadEntry('test-entry-1')

      expect(store.entries[0]).toEqual(updatedEntry)
      expect(store.currentEntry).toEqual(updatedEntry)
    })

    it('should return undefined for non-existent entry', async () => {
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'success',
        entry: undefined
      })

      const result = await store.loadEntry('non-existent')

      expect(result).toBeUndefined()
      expect(store.currentEntry).toBeUndefined()
    })

    it('should handle load entry errors', async () => {
      const errorMessage = 'Entry not found'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.loadEntry('test-entry-1')).rejects.toThrow(errorMessage)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })
  })

  describe('Save Entry', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should save a new entry successfully', async () => {
      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.saveEntry(mockEntry)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBeUndefined()
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:save', {
        entry: mockEntry
      })
    })

    it('should add new entry to the beginning of entries list', async () => {
      // Start with empty list
      expect(store.entries).toEqual([])

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.saveEntry(mockEntry)

      expect(store.entries).toEqual([mockEntry])
    })

    it('should update existing entry in the list', async () => {
      // First add an entry
      mockIpcRenderer.invoke.mockResolvedValueOnce({ type: 'success' })
      await store.saveEntry(mockEntry)

      // Then save an updated version
      const updatedEntry = { ...mockEntry, status: 'failed' as const }
      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.saveEntry(updatedEntry)

      expect(store.entries[0]).toEqual(updatedEntry)
    })

    it('should update current entry if it matches', async () => {
      // Set current entry
      store.currentEntry = mockEntry

      const updatedEntry = { ...mockEntry, status: 'failed' }
      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.saveEntry(updatedEntry)

      expect(store.currentEntry).toEqual(updatedEntry)
    })

    it('should handle save errors', async () => {
      const errorMessage = 'Failed to save entry'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.saveEntry(mockEntry)).rejects.toThrow(errorMessage)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })
  })

  describe('Update Entry', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should update an existing entry successfully', async () => {
      // First add an entry
      mockIpcRenderer.invoke.mockResolvedValueOnce({ type: 'success' })
      await store.saveEntry(mockEntry)

      const updates = { status: 'failed' as const }
      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.updateEntry('test-entry-1', updates)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBeUndefined()
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:update', {
        id: 'test-entry-1',
        updates
      })
    })

    it('should update entry in the list with new data', async () => {
      // First add an entry
      mockIpcRenderer.invoke.mockResolvedValueOnce({ type: 'success' })
      await store.saveEntry(mockEntry)

      const updates = { status: 'failed' as const }
      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.updateEntry('test-entry-1', updates)

      expect(store.entries[0].status).toBe('failed')
      expect(store.entries[0].updatedAt).toBeGreaterThan(mockEntry.updatedAt)
    })

    it('should update current entry if it matches', async () => {
      // Set current entry
      store.currentEntry = mockEntry

      const updates = { status: 'failed' as const }
      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.updateEntry('test-entry-1', updates)

      expect((store.currentEntry as any)?.status).toBe('failed')
    })

    it('should handle update errors', async () => {
      const errorMessage = 'Failed to update entry'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.updateEntry('test-entry-1', { status: 'failed' })).rejects.toThrow(
        errorMessage
      )

      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })
  })

  describe('Delete Entry', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should delete an entry successfully', async () => {
      // First add an entry
      mockIpcRenderer.invoke.mockResolvedValueOnce({ type: 'success' })
      await store.saveEntry(mockEntry)

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.deleteEntry('test-entry-1')

      expect(store.isLoading).toBe(false)
      expect(store.error).toBeUndefined()
      expect(store.entries).toEqual([])
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:delete', {
        id: 'test-entry-1'
      })
    })

    it('should clear current entry if it matches the deleted entry', async () => {
      // Set current entry
      store.currentEntry = mockEntry

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.deleteEntry('test-entry-1')

      expect(store.currentEntry).toBeUndefined()
    })

    it('should handle delete errors', async () => {
      const errorMessage = 'Failed to delete entry'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.deleteEntry('test-entry-1')).rejects.toThrow(errorMessage)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })
  })

  describe('Delete by Project', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should delete all entries for a project successfully', async () => {
      // Add multiple entries for the same project
      const entry1 = { ...mockEntry, id: 'test-entry-1' }
      const entry2 = { ...mockEntry, id: 'test-entry-2' }

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })
      await store.saveEntry(entry1)
      await store.saveEntry(entry2)

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.deleteByProject('project-1')

      expect(store.isLoading).toBe(false)
      expect(store.error).toBeUndefined()
      expect(store.entries).toEqual([])
    })

    it('should clear current entry if it belongs to the deleted project', async () => {
      // Set current entry
      store.currentEntry = mockEntry

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.deleteByProject('project-1')

      expect(store.currentEntry).toBeUndefined()
    })

    it('should handle delete by project errors', async () => {
      const errorMessage = 'Failed to delete project entries'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.deleteByProject('project-1')).rejects.toThrow(errorMessage)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })
  })

  describe('Clear History', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should clear all history successfully', async () => {
      // First add some entries
      mockIpcRenderer.invoke.mockResolvedValueOnce({ type: 'success' })
      await store.saveEntry(mockEntry)

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })

      await store.clearHistory()

      expect(store.isLoading).toBe(false)
      expect(store.error).toBeUndefined()
      expect(store.entries).toEqual([])
      expect(store.currentEntry).toBeUndefined()
      expect(store.storageInfo).toBeUndefined()
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:clear')
    })

    it('should handle clear history errors', async () => {
      const errorMessage = 'Failed to clear history'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.clearHistory()).rejects.toThrow(errorMessage)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })
  })

  describe('Refresh Storage Info', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should refresh storage info successfully', async () => {
      const storageInfo = {
        totalEntries: 10,
        totalSize: 1024,
        oldestEntry: Date.now() - 86400000,
        newestEntry: Date.now()
      }

      mockIpcRenderer.invoke.mockResolvedValue(storageInfo)

      await store.refreshStorageInfo()

      expect(store.storageInfo).toEqual(storageInfo)
      expect(store.error).toBeUndefined()
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('build-history:get-storage-info')
    })

    it('should handle storage info errors', async () => {
      const errorMessage = 'Failed to get storage info'
      mockIpcRenderer.invoke.mockResolvedValue({
        type: 'error',
        ipcError: errorMessage
      })

      await expect(store.refreshStorageInfo()).rejects.toThrow(errorMessage)

      expect(store.isLoading).toBe(false)
      expect(store.error).toBe(errorMessage)
    })

    it('should not make IPC call for unauthorized users', async () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(false)

      await store.refreshStorageInfo()

      expect(mockIpcRenderer.invoke).not.toHaveBeenCalled()
      expect(store.storageInfo).toBeUndefined()
    })
  })

  describe('Filter and Pagination Management', () => {
    it('should update filters correctly', () => {
      const newFilters = { status: 'completed' as const, projectName: 'Test Project' }

      store.setFilters(newFilters)

      expect(store.filters).toEqual(newFilters)
    })

    it('should merge filters with existing ones', () => {
      store.setFilters({ status: 'completed' })
      store.setFilters({ projectName: 'Test Project' })

      expect(store.filters).toEqual({
        status: 'completed',
        projectName: 'Test Project'
      })
    })

    it('should update pagination correctly', () => {
      const newPagination = { page: 2, pageSize: 50 }

      store.setPagination(newPagination)

      expect(store.pagination).toEqual({
        page: 1,
        pageSize: 20,
        sortBy: 'startTime',
        sortOrder: 'desc',
        ...newPagination
      })
    })

    it('should reset filters to empty object', () => {
      store.setFilters({ status: 'completed', projectName: 'Test Project' })
      store.resetFilters()

      expect(store.filters).toEqual({})
    })

    it('should reset pagination to defaults', () => {
      store.setPagination({ page: 5, pageSize: 100 })
      store.resetPagination()

      expect(store.pagination).toEqual({
        page: 1,
        pageSize: 20,
        sortBy: 'startTime',
        sortOrder: 'desc'
      })
    })
  })

  describe('Computed Properties', () => {
    it('should compute hasEntries correctly', async () => {
      expect(store.hasEntries).toBe(false)

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })
      await store.saveEntry(mockEntry)

      expect(store.hasEntries).toBe(true)
    })

    it('should compute totalEntries correctly', async () => {
      expect(store.totalEntries).toBe(0)

      mockIpcRenderer.invoke.mockResolvedValue({ type: 'success' })
      await store.saveEntry(mockEntry)

      expect(store.totalEntries).toBe(1)
    })

    it('should compute isPaidUser from auth store', () => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()

      mockAuthStore.hasBenefit.mockReturnValue(false)
      expect(store.isPaidUser).toBe(false)

      mockAuthStore.hasBenefit.mockReturnValue(true)
      expect(store.isPaidUser).toBe(true)
    })

    it('should compute hasSubscriptionError correctly', () => {
      expect(store.hasSubscriptionError).toBe(false)

      // Simulate subscription error
      store.subscriptionError = new SubscriptionRequiredError('build-history')
      expect(store.hasSubscriptionError).toBe(true)
    })

    it('should compute subscriptionErrorCode correctly', () => {
      expect(store.subscriptionErrorCode).toBeUndefined()

      const error = new SubscriptionRequiredError('build-history')
      store.subscriptionError = error

      expect(store.subscriptionErrorCode).toBe('SUBSCRIPTION_REQUIRED')
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      const { useAuth } = require('../renderer/store/auth')
      const mockAuthStore = useAuth()
      mockAuthStore.hasBenefit.mockReturnValue(true)
    })

    it('should clear errors correctly', () => {
      store.error = 'Some error'
      store.subscriptionError = new SubscriptionRequiredError('build-history')

      store.clearError()

      expect(store.error).toBeUndefined()
      expect(store.subscriptionError).toBeUndefined()
    })

    it('should handle error state correctly', () => {
      // Test that error state is properly managed
      expect(store.error).toBeUndefined()
      expect(store.subscriptionError).toBeUndefined()
    })

    it('should handle subscription errors in operations', async () => {
      const subscriptionError = new SubscriptionRequiredError('build-history')
      mockIpcRenderer.invoke.mockRejectedValue(subscriptionError)

      await store.loadEntries()

      expect(store.hasSubscriptionError).toBe(true)
      expect(store.subscriptionError).toBe(subscriptionError)
      expect(store.isLoading).toBe(false)
    })
  })

  describe('Query Building', () => {
    it('should build query from current filters and pagination', () => {
      store.setFilters({ status: 'completed', projectName: 'Test Project' })
      store.setPagination({ page: 2, pageSize: 50, sortBy: 'projectName', sortOrder: 'asc' })

      const query = store.buildQuery()

      expect(query).toEqual({
        filters: {
          status: 'completed',
          projectName: 'Test Project'
        },
        pagination: {
          page: 2,
          pageSize: 50,
          sortBy: 'projectName',
          sortOrder: 'asc'
        }
      })
    })
  })
})
