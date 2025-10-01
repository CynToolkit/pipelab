<template>
  <div class="build-history-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-content">
        <div class="title-section">
          <h1>Build History</h1>
          <p class="page-description">
            Track and manage your build executions, view detailed logs, and monitor project build
            status.
          </p>
        </div>

        <div class="header-actions">
          <Button
            v-tooltip.top="'Refresh build history'"
            label="Refresh"
            severity="secondary"
            :loading="isLoading"
            @click="refreshHistory"
          >
            <i class="pi pi-refresh"></i>
          </Button>
          <Button
            v-if="isPaidUser"
            v-tooltip.top="'Clear all build history'"
            label="Clear History"
            severity="danger"
            @click="confirmClearHistory"
          >
            <i class="pi pi-trash"></i>
          </Button>
        </div>
      </div>

      <!-- Subscription Status -->
      <div class="subscription-status">
        <div v-if="isPaidUser" class="premium-status">
          <i class="pi pi-star"></i>
          <span>Premium Feature - Build History Enabled</span>
        </div>
        <div v-else class="free-status">
          <i class="pi pi-lock"></i>
          <span>Premium Feature Required</span>
          <Button label="Upgrade" size="small" @click="showSubscriptionOptions" />
        </div>
      </div>
    </div>

    <!-- Subscription Error Display -->
    <div v-if="hasSubscriptionError" class="subscription-error">
      <div class="error-icon">
        <i class="pi pi-exclamation-triangle"></i>
      </div>
      <div class="error-content">
        <h3>Subscription Required</h3>
        <p>{{ subscriptionError?.userMessage }}</p>
        <div class="error-actions">
          <Button
            label="Upgrade Subscription"
            severity="primary"
            @click="showSubscriptionOptions"
          />
          <Button label="Back to Dashboard" severity="secondary" @click="goToDashboard" />
        </div>
      </div>
    </div>

    <!-- Main Content (only show if authorized) -->
    <div v-else-if="isPaidUser" class="main-content">
      <!-- Filters Section -->
      <BuildHistoryFilters
        :filters="filters"
        :has-entries="hasEntries"
        @update:filters="onFiltersChange"
        @export="onExportData"
      />

      <!-- Build History List -->
      <BuildHistoryList
        :entries="entries"
        :is-loading="isLoading"
        :error="error"
        :total-count="totalCount"
        :pagination="pagination"
        :can-delete="true"
        :can-start-build="true"
        @load-more="loadMore"
        @retry-load="retryLoad"
        @view-details="onViewDetails"
        @delete="onDeleteEntry"
        @start-build="onStartBuild"
        @sort-change="onSortChange"
        @page-change="onPageChange"
      />

      <!-- Storage Information -->
      <div v-if="storageInfo" class="storage-info">
        <div class="storage-header">
          <h3>Storage Information</h3>
          <Button
            v-tooltip.top="'Refresh storage info'"
            text
            severity="secondary"
            size="small"
            @click="refreshStorageInfo"
          >
            <i class="pi pi-refresh"></i>
          </Button>
        </div>
        <div class="storage-stats">
          <div class="stat-item">
            <label>Total Entries:</label>
            <span>{{ storageInfo.totalEntries.toLocaleString() }}</span>
          </div>
          <div class="stat-item">
            <label>Storage Size:</label>
            <span>{{ formatSize(storageInfo.totalSize) }}</span>
          </div>
          <div v-if="storageInfo.oldestEntry" class="stat-item">
            <label>Oldest Entry:</label>
            <span>{{ formatDate(storageInfo.oldestEntry) }}</span>
          </div>
          <div v-if="storageInfo.newestEntry" class="stat-item">
            <label>Newest Entry:</label>
            <span>{{ formatDate(storageInfo.newestEntry) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Unauthorized State -->
    <div v-else class="unauthorized-state">
      <div class="unauthorized-icon">
        <i class="pi pi-lock"></i>
      </div>
      <h3>Premium Feature</h3>
      <p>Build history tracking is available with a premium subscription.</p>
      <div class="unauthorized-actions">
        <Button label="Upgrade to Access" severity="primary" @click="showSubscriptionOptions" />
        <Button label="Back to Dashboard" severity="secondary" @click="goToDashboard" />
      </div>
    </div>

    <!-- Build Details Modal -->
    <BuildDetailsModal
      :entry="selectedEntry"
      :visible="showDetailsModal"
      :can-delete="true"
      :can-retry="true"
      @hide="closeDetailsModal"
      @retry="onRetryBuild"
      @delete="onDeleteEntry"
    />

    <!-- Confirmation Dialogs -->
    <ConfirmDialog />

    <!-- Export Progress Dialog -->
    <Dialog
      v-model:visible="showExportDialog"
      modal
      header="Export Build History"
      :style="{ width: '400px' }"
      :closable="true"
    >
      <div class="export-dialog">
        <p>Exporting build history data...</p>
        <ProgressBar :value="exportProgress" :show-value="true" />
        <p class="export-status">{{ exportStatus }}</p>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useBuildHistory } from '../store/build-history'
import type { BuildHistoryEntry, BuildFilters } from '@@/build-history'

// Components
import BuildHistoryFilters from '../components/BuildHistoryFilters.vue'
import BuildHistoryList from '../components/BuildHistoryList.vue'
import BuildDetailsModal from '../components/BuildDetailsModal.vue'

// Composables
const router = useRouter()
const confirm = useConfirm()

// Stores
const buildHistoryStore = useBuildHistory()

// Local state
const selectedEntry = ref<BuildHistoryEntry | null>(null)
const showDetailsModal = ref(false)
const showExportDialog = ref(false)
const exportProgress = ref(0)
const exportStatus = ref('')

// Computed properties
const entries = buildHistoryStore.entries
const isLoading = buildHistoryStore.isLoading
const error = buildHistoryStore.error
const subscriptionError = buildHistoryStore.subscriptionError
const storageInfo = buildHistoryStore.storageInfo
const hasEntries = buildHistoryStore.hasEntries
const isPaidUser = buildHistoryStore.isPaidUser
const hasSubscriptionError = buildHistoryStore.hasSubscriptionError
const filters = buildHistoryStore.filters
const pagination = buildHistoryStore.pagination

const totalCount = computed(() => storageInfo?.totalEntries || 0)

// Methods
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString()
}

const formatSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

const refreshHistory = async () => {
  try {
    await buildHistoryStore.loadEntries()
  } catch (error) {
    console.error('Failed to refresh build history:', error)
  }
}

const retryLoad = async () => {
  try {
    await buildHistoryStore.loadEntries()
  } catch (error) {
    console.error('Failed to retry loading build history:', error)
  }
}

const loadMore = async () => {
  const nextPage = pagination.page + 1
  const newPagination = { ...pagination, page: nextPage }

  try {
    await buildHistoryStore.loadEntries({
      filters: filters,
      pagination: newPagination
    })
  } catch (error) {
    console.error('Failed to load more entries:', error)
  }
}

const onFiltersChange = (newFilters: BuildFilters) => {
  buildHistoryStore.setFilters(newFilters)
  buildHistoryStore.setPagination({ ...pagination, page: 1 })
  buildHistoryStore.loadEntries()
}

const onSortChange = (sortBy: string, sortOrder: 'asc' | 'desc') => {
  buildHistoryStore.setPagination({
    ...pagination,
    sortBy: sortBy as keyof BuildHistoryEntry,
    sortOrder,
    page: 1
  })
  buildHistoryStore.loadEntries()
}

const onPageChange = (page: number, pageSize: number) => {
  buildHistoryStore.setPagination({
    ...pagination,
    page,
    pageSize
  })
  buildHistoryStore.loadEntries()
}

const onViewDetails = (entry: BuildHistoryEntry) => {
  selectedEntry.value = entry
  showDetailsModal.value = true
}

const closeDetailsModal = () => {
  showDetailsModal.value = false
  selectedEntry.value = null
}

const onDeleteEntry = async (entry: BuildHistoryEntry) => {
  confirm.require({
    message: `Are you sure you want to delete the build history entry for "${entry.projectName}"?`,
    header: 'Delete Build History Entry',
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await buildHistoryStore.deleteEntry(entry.id)
      } catch (error) {
        console.error('Failed to delete entry:', error)
      }
    }
  })
}

const onRetryBuild = async (entry: BuildHistoryEntry) => {
  // Close the modal first
  closeDetailsModal()

  // In a real implementation, this would trigger a new build with the same parameters
  console.log('Retrying build for entry:', entry.id)

  // For now, just show a message
  confirm.require({
    message: `Retry build functionality would start a new build for "${entry.projectName}". This feature is not yet implemented.`,
    header: 'Retry Build',
    icon: 'pi pi-info-circle',
    accept: () => {
      // Future implementation would go here
    }
  })
}

const onStartBuild = () => {
  // Navigate to the appropriate build/start page
  router.push('/scenarios')
}

const confirmClearHistory = () => {
  confirm.require({
    message: 'Are you sure you want to clear all build history? This action cannot be undone.',
    header: 'Clear All Build History',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await buildHistoryStore.clearHistory()
      } catch (error) {
        console.error('Failed to clear history:', error)
      }
    }
  })
}

const refreshStorageInfo = async () => {
  try {
    await buildHistoryStore.refreshStorageInfo()
  } catch (error) {
    console.error('Failed to refresh storage info:', error)
  }
}

const onExportData = async () => {
  showExportDialog.value = true
  exportProgress.value = 0
  exportStatus.value = 'Preparing export...'

  try {
    // Simulate export progress
    const progressInterval = setInterval(() => {
      exportProgress.value += 10
      if (exportProgress.value <= 30) {
        exportStatus.value = 'Preparing data...'
      } else if (exportProgress.value <= 70) {
        exportStatus.value = `Processing entries... (${exportProgress.value}%)`
      } else if (exportProgress.value <= 90) {
        exportStatus.value = 'Generating file...'
      }
    }, 200)

    // Simulate export completion
    setTimeout(() => {
      clearInterval(progressInterval)
      exportProgress.value = 100
      exportStatus.value = 'Export completed!'

      setTimeout(() => {
        showExportDialog.value = false
        exportProgress.value = 0
        exportStatus.value = ''
      }, 1000)
    }, 3000)
  } catch (error) {
    console.error('Export failed:', error)
    exportStatus.value = 'Export failed'
    setTimeout(() => {
      showExportDialog.value = false
      exportProgress.value = 0
      exportStatus.value = ''
    }, 2000)
  }
}

const showSubscriptionOptions = () => {
  // In a real implementation, this would open a subscription modal or redirect to pricing page
  confirm.require({
    message: 'This would open subscription options or redirect to the pricing page.',
    header: 'Subscription Required',
    icon: 'pi pi-info-circle',
    accept: () => {
      // Future implementation would go here
    }
  })
}

const goToDashboard = () => {
  router.push('/dashboard')
}

// Initialize - load data when component mounts
onMounted(async () => {
  if (isPaidUser) {
    try {
      await buildHistoryStore.loadEntries()
      await buildHistoryStore.refreshStorageInfo()
    } catch (error) {
      console.error('Failed to initialize build history page:', error)
    }
  }
})

// Cleanup - clear selection when component unmounts
onUnmounted(() => {
  selectedEntry.value = null
})
</script>

<style scoped>
.build-history-page {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e9ecef;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  margin-bottom: 1rem;
}

.title-section {
  flex: 1;
}

.title-section h1 {
  margin: 0 0 0.5rem 0;
  color: #495057;
  font-size: 2rem;
  font-weight: 700;
}

.page-description {
  margin: 0;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.5;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.subscription-status {
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
}

.premium-status {
  background: linear-gradient(135deg, #28a745, #20c997);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.free-status {
  background: linear-gradient(135deg, #ffc107, #fd7e14);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.subscription-error {
  display: flex;
  align-items: center;
  padding: 2rem;
  background: linear-gradient(135deg, #dc3545, #e83e8c);
  color: #fff;
  border-radius: 12px;
  margin-bottom: 2rem;
}

.error-icon {
  font-size: 3rem;
  margin-right: 1.5rem;
}

.error-content h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
}

.error-content p {
  margin: 0 0 1.5rem 0;
  opacity: 0.9;
}

.error-actions {
  display: flex;
  gap: 1rem;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.storage-info {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1.5rem;
}

.storage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.storage-header h3 {
  margin: 0;
  color: #495057;
  font-size: 1.25rem;
}

.storage-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.stat-item label {
  font-weight: 600;
  color: #6c757d;
}

.stat-item span {
  color: #495057;
  font-weight: 500;
}

.unauthorized-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #6c757d;
}

.unauthorized-icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  opacity: 0.5;
}

.unauthorized-state h3 {
  margin: 0 0 1rem 0;
  color: #495057;
  font-size: 1.5rem;
}

.unauthorized-state p {
  margin: 0 0 2rem 0;
  font-size: 1.1rem;
}

.unauthorized-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.export-dialog {
  text-align: center;
}

.export-dialog p {
  margin: 0 0 1rem 0;
  color: #495057;
}

.export-status {
  margin-top: 1rem;
  font-size: 0.875rem;
  color: #6c757d;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .build-history-page {
    padding: 1rem;
  }

  .header-content {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: center;
  }

  .subscription-status {
    margin-top: 1rem;
  }

  .free-status,
  .premium-status {
    flex-direction: column;
    gap: 0.5rem;
  }

  .subscription-error {
    flex-direction: column;
    text-align: center;
  }

  .error-icon {
    margin-right: 0;
    margin-bottom: 1rem;
  }

  .error-actions {
    justify-content: center;
  }

  .unauthorized-actions {
    flex-direction: column;
    align-items: center;
  }

  .storage-stats {
    grid-template-columns: 1fr;
  }
}
</style>
