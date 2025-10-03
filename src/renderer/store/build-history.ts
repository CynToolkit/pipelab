import { defineStore, storeToRefs } from 'pinia'
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

  const {} = authStore
  const { hasBuildHistoryBenefit } = storeToRefs(authStore)

  const isRefreshingHistory = ref(false)

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
      console.log('result', result)
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
  const storageInfo = ref<
    | {
        totalEntries: number
        totalSize: number
        oldestEntry?: number
        newestEntry?: number
      }
    | undefined
  >()

  // Filtering state
  const currentPipelineId = ref<string | undefined>()
  const currentScenarioId = ref<string | undefined>()

  // Computed
  const hasEntries = computed(() => entries.value.length > 0)
  const totalEntries = computed(() => entries.value.length)
  const canUseHistory = computed(() => hasBuildHistoryBenefit.value)

  const setError = (errorMessage: string) => {
    error.value = errorMessage
    logger.logger().error('[Build History]', errorMessage)
  }

  const buildQuery = (): BuildHistoryQuery => ({
    pipelineId: currentPipelineId.value
  })

  // Actions
  const loadEntries = async (query?: BuildHistoryQuery): Promise<void> => {
    console.trace('query', query)
    isLoading.value = true

    // Check authorization before attempting to load
    if (!canUseHistory.value) {
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

    // Check authorization before attempting to load
    if (!canUseHistory.value) {
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to load build history entry'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const saveEntry = async (entry: BuildHistoryEntry): Promise<void> => {
    isLoading.value = true

    // Check authorization before attempting to save
    if (!canUseHistory.value) {
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to save build history entry'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const updateEntry = async (id: string, updates: Partial<BuildHistoryEntry>): Promise<void> => {
    isLoading.value = true

    // Check authorization before attempting to update
    if (!canUseHistory.value) {
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

    // Check authorization before attempting to delete
    if (!canUseHistory.value) {
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
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete build history entry'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const clearHistory = async (): Promise<void> => {
    isLoading.value = true

    // Check authorization before attempting to clear
    if (!canUseHistory.value) {
      isLoading.value = false
      return
    }

    try {
      await buildHistoryAPI.clear()
      entries.value = []
      currentEntry.value = undefined
      storageInfo.value = undefined
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear build history'
      setError(errorMessage)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const refreshStorageInfo = async (): Promise<void> => {
    // Check authorization before attempting to get storage info
    if (!canUseHistory.value) {
      return
    }

    try {
      storageInfo.value = await buildHistoryAPI.getStorageInfo()
    } catch (err) {
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

  const setCurrentScenario = (scenarioId: string | undefined): void => {
    currentScenarioId.value = scenarioId
  }

  const clearCurrentScenario = (): void => {
    currentScenarioId.value = undefined
  }

  return {
    // State
    entries: entries,
    currentEntry: readonly(currentEntry),
    isLoading: readonly(isLoading),
    error: readonly(error),
    storageInfo: readonly(storageInfo),

    // Computed
    hasEntries,
    totalEntries,
    canUseHistory,

    // Pipeline filtering
    currentPipelineId: readonly(currentPipelineId),
    currentScenarioId: readonly(currentScenarioId),

    // Actions
    loadEntries,
    loadEntry,
    saveEntry,
    updateEntry,
    deleteEntry,
    clearHistory,
    refreshStorageInfo,
    setCurrentPipeline,
    clearCurrentPipeline,
    setCurrentScenario,
    clearCurrentScenario,

    // Query builder
    buildQuery
  }
})
