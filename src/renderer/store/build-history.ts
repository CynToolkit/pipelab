import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { useLogger } from '@@/logger'
import { useAuth } from './auth'
import { useAPI } from '@renderer/composables/api'
import type {
  BuildHistoryEntry,
  BuildHistoryQuery,
  BuildHistoryResponse,
  SubscriptionError
} from '@@/build-history'
import { isSubscriptionError, SubscriptionRequiredError } from '@@/subscription-errors'

export const useBuildHistory = defineStore('build-history', () => {
  const api = useAPI()
  const logger = useLogger()
  const authStore = useAuth()

  // IPC API functions
  const buildHistoryAPI = {
    async save(entry: BuildHistoryEntry): Promise<void> {
      const result = await api.execute('build-history:save', {
        entry
      })
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to save build history entry')
      }
    },

    async get(id: string): Promise<BuildHistoryEntry | undefined> {
      const result = await api.execute('build-history:get', { id })
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to get build history entry')
      }
      return result.result.entry
    },

    async getAll(query?: BuildHistoryQuery): Promise<BuildHistoryResponse> {
      const result = await api.execute('build-history:get-all', {
        query
      })
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to get build history entries')
      }
      return result.result
    },

    async update(id: string, updates: Partial<BuildHistoryEntry>): Promise<void> {
      const result = await api.execute('build-history:update', {
        id,
        updates
      })
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to update build history entry')
      }
    },

    async delete(id: string): Promise<void> {
      const result = await api.execute('build-history:delete', { id })
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to delete build history entry')
      }
    },

    async deleteByProject(projectId: string): Promise<void> {
      const result = await api.execute('build-history:delete-by-project', {
        projectId
      })
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to delete build history entries for project')
      }
    },

    async clear(): Promise<void> {
      const result = await api.execute('build-history:clear')
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to clear build history')
      }
    },

    async getStorageInfo(): Promise<{
      totalEntries: number
      totalSize: number
      oldestEntry?: number
      newestEntry?: number
    }> {
      const result = await api.execute('build-history:get-storage-info')
      if (result.type === 'error') {
        throw new Error(result.ipcError || 'Failed to get build history storage info')
      }
      return result.result
    }
  }

  // State
  const entries = ref<BuildHistoryEntry[]>([])
  const currentEntry = ref<BuildHistoryEntry | undefined>()
  const isLoading = ref(false)
  const error = ref<string | undefined>()
  const subscriptionError = ref<SubscriptionError | undefined>()
  const storageInfo = ref<
    | {
        totalEntries: number
        totalSize: number
        oldestEntry?: number
        newestEntry?: number
      }
    | undefined
  >()

  // Simplified state - just current pipeline filter
  const currentPipelineId = ref<string | undefined>()

  // Computed
  const hasEntries = computed(() => entries.value.length > 0)
  const totalEntries = computed(() => entries.value.length)
  const isPaidUser = computed(() => authStore.hasBenefit('cloud-save'))
  const hasSubscriptionError = computed(() => subscriptionError.value !== undefined)
  const subscriptionErrorCode = computed(() => subscriptionError.value?.code)

  // Helper functions
  const clearError = () => {
    error.value = undefined
    subscriptionError.value = undefined
  }

  const setError = (errorMessage: string) => {
    error.value = errorMessage
    logger.logger().error('[Build History]', errorMessage)
  }

  const setSubscriptionError = (subError: SubscriptionError) => {
    subscriptionError.value = subError
    error.value = subError.userMessage
    logger.logger().warn('[Build History] Subscription error:', subError.code)
  }

  const handleSubscriptionError = (error: unknown): boolean => {
    if (isSubscriptionError(error)) {
      setSubscriptionError(error)
      return true
    }
    return false
  }

  const checkBuildHistoryAuthorization = (): boolean => {
    if (!isPaidUser.value) {
      const subError = new SubscriptionRequiredError('build-history')
      setSubscriptionError(subError)
      return false
    }
    return true
  }

  const buildQuery = (): BuildHistoryQuery => ({
    pipelineId: currentPipelineId.value
  })

  // Actions
  const loadEntries = async (query?: BuildHistoryQuery): Promise<void> => {
    isLoading.value = true
    clearError()

    // Check authorization before attempting to load
    if (!checkBuildHistoryAuthorization()) {
      isLoading.value = false
      return
    }

    try {
      const response = await buildHistoryAPI.getAll(query)
      entries.value = response.entries
      storageInfo.value = {
        totalEntries: response.total,
        totalSize: 0, // This would need to be calculated separately
        oldestEntry:
          response.total > 0 ? Math.min(...response.entries.map((e) => e.startTime)) : undefined,
        newestEntry:
          response.total > 0 ? Math.max(...response.entries.map((e) => e.startTime)) : undefined
      }
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        isLoading.value = false
        return
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load build history entries'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadEntry = async (id: string): Promise<BuildHistoryEntry | undefined> => {
    isLoading.value = true
    clearError()

    // Check authorization before attempting to load
    if (!checkBuildHistoryAuthorization()) {
      isLoading.value = false
      return undefined
    }

    try {
      const entry = await buildHistoryAPI.get(id)
      if (entry) {
        currentEntry.value = entry
        // Update entry in the entries list if it exists
        const index = entries.value.findIndex((e) => e.id === id)
        if (index >= 0) {
          entries.value[index] = entry
        }
      }
      return entry
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        isLoading.value = false
        return undefined
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to load build history entry'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const saveEntry = async (entry: BuildHistoryEntry): Promise<void> => {
    isLoading.value = true
    clearError()

    // Check authorization before attempting to save
    if (!checkBuildHistoryAuthorization()) {
      isLoading.value = false
      return
    }

    try {
      await buildHistoryAPI.save(entry)

      // Add or update entry in the local state
      const existingIndex = entries.value.findIndex((e) => e.id === entry.id)
      if (existingIndex >= 0) {
        entries.value[existingIndex] = entry
      } else {
        entries.value.unshift(entry)
      }

      // Update current entry if it's the same
      if (currentEntry.value?.id === entry.id) {
        currentEntry.value = entry
      }
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        isLoading.value = false
        return
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to save build history entry'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const updateEntry = async (id: string, updates: Partial<BuildHistoryEntry>): Promise<void> => {
    isLoading.value = true
    clearError()

    // Check authorization before attempting to update
    if (!checkBuildHistoryAuthorization()) {
      isLoading.value = false
      return
    }

    try {
      await buildHistoryAPI.update(id, updates)

      // Update entry in local state
      const index = entries.value.findIndex((e) => e.id === id)
      if (index >= 0) {
        entries.value[index] = { ...entries.value[index], ...updates, updatedAt: Date.now() }
      }

      // Update current entry if it's the same
      if (currentEntry.value?.id === id) {
        currentEntry.value = { ...currentEntry.value, ...updates, updatedAt: Date.now() }
      }
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        isLoading.value = false
        return
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update build history entry'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteEntry = async (id: string): Promise<void> => {
    isLoading.value = true
    clearError()

    // Check authorization before attempting to delete
    if (!checkBuildHistoryAuthorization()) {
      isLoading.value = false
      return
    }

    try {
      await buildHistoryAPI.delete(id)

      // Remove from local state
      const index = entries.value.findIndex((e) => e.id === id)
      if (index >= 0) {
        entries.value.splice(index, 1)
      }

      // Clear current entry if it's the same
      if (currentEntry.value?.id === id) {
        currentEntry.value = undefined
      }
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        isLoading.value = false
        return
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete build history entry'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteByProject = async (projectId: string): Promise<void> => {
    isLoading.value = true
    clearError()

    // Check authorization before attempting to delete
    if (!checkBuildHistoryAuthorization()) {
      isLoading.value = false
      return
    }

    try {
      await buildHistoryAPI.deleteByProject(projectId)

      // Remove all entries for this project from local state
      entries.value = entries.value.filter((e) => e.projectId !== projectId)

      // Clear current entry if it's from this project
      if (currentEntry.value?.projectId === projectId) {
        currentEntry.value = undefined
      }
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        isLoading.value = false
        return
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete build history entries for project'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const clearHistory = async (): Promise<void> => {
    isLoading.value = true
    clearError()

    // Check authorization before attempting to clear
    if (!checkBuildHistoryAuthorization()) {
      isLoading.value = false
      return
    }

    try {
      await buildHistoryAPI.clear()
      entries.value = []
      currentEntry.value = undefined
      storageInfo.value = undefined
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        isLoading.value = false
        return
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to clear build history'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const refreshStorageInfo = async (): Promise<void> => {
    // Check authorization before attempting to get storage info
    if (!checkBuildHistoryAuthorization()) {
      return
    }

    try {
      storageInfo.value = await buildHistoryAPI.getStorageInfo()
    } catch (err) {
      // Handle subscription errors specifically
      if (handleSubscriptionError(err)) {
        return
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh storage info'
      setError(errorMessage)
    }
  }

  const setCurrentPipeline = (pipelineId: string | undefined): void => {
    currentPipelineId.value = pipelineId
  }

  const clearCurrentPipeline = (): void => {
    currentPipelineId.value = undefined
  }

  // Initialize - load entries on store creation
  loadEntries()

  return {
    // State
    entries: readonly(entries),
    currentEntry: readonly(currentEntry),
    isLoading: readonly(isLoading),
    error: readonly(error),
    subscriptionError: readonly(subscriptionError),
    storageInfo: readonly(storageInfo),

    // Computed
    hasEntries,
    totalEntries,
    isPaidUser,
    hasSubscriptionError,
    subscriptionErrorCode,

    // Pipeline filtering
    currentPipelineId: readonly(currentPipelineId),

    // Actions
    loadEntries,
    loadEntry,
    saveEntry,
    updateEntry,
    deleteEntry,
    deleteByProject,
    clearHistory,
    refreshStorageInfo,
    setCurrentPipeline,
    clearCurrentPipeline,
    clearError,

    // Query builder
    buildQuery
  }
})
