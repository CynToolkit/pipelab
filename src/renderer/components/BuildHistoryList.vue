<template>
  <div class="build-history-list">
    <!-- Loading State -->
    <div v-if="isLoading && !hasEntries" class="loading-state">
      <ProgressSpinner />
      <p>Loading build history...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error && !hasSubscriptionError" class="error-state">
      <i class="pi pi-exclamation-triangle"></i>
      <div class="error-content">
        <h4>Failed to Load Build History</h4>
        <p>{{ error }}</p>
        <Button label="Retry" severity="secondary" @click="retryLoad" />
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!hasEntries && !isLoading" class="empty-state">
      <i class="pi pi-history"></i>
      <div class="empty-content">
        <h4>No Build History</h4>
        <p>Start a build to see your history here.</p>
        <Button
          v-if="canStartBuild"
          label="Start New Build"
          severity="primary"
          @click="startNewBuild"
        />
      </div>
    </div>

    <!-- Build History List -->
    <div v-else class="history-content">
      <!-- List Header -->
      <div class="list-header">
        <div class="results-info">
          <span class="results-count">
            Showing {{ entries.length }} of {{ totalCount }} entries
          </span>
          <div class="view-controls">
            <div class="view-mode">
              <Button
                v-tooltip.top="'List View'"
                text
                severity="secondary"
                size="small"
                :class="{ active: viewMode === 'list' }"
                @click="viewMode = 'list'"
              >
                <i class="pi pi-list"></i>
              </Button>
              <Button
                v-tooltip.top="'Grid View'"
                text
                severity="secondary"
                size="small"
                :class="{ active: viewMode === 'grid' }"
                @click="viewMode = 'grid'"
              >
                <i class="pi pi-th-large"></i>
              </Button>
            </div>
          </div>
        </div>

        <!-- Sort Controls -->
        <div class="sort-controls">
          <label for="sortBy">Sort by:</label>
          <Dropdown
            id="sortBy"
            v-model="sortBy"
            :options="sortOptions"
            option-label="label"
            option-value="value"
            class="sort-dropdown"
            @change="onSortChange"
          />
          <Button
            v-tooltip.top="`Sort ${sortOrder === 'desc' ? 'Ascending' : 'Descending'}`"
            text
            severity="secondary"
            size="small"
            @click="toggleSortOrder"
          >
            <i :class="`pi pi-sort-${sortOrder === 'desc' ? 'down' : 'up'}`"></i>
          </Button>
        </div>
      </div>

      <!-- List/Grid Content -->
      <div class="entries-container" :class="`view-${viewMode}`">
        <!-- List View -->
        <div v-if="viewMode === 'list'" class="list-view">
          <div class="entries-list">
            <BuildHistoryItem
              v-for="entry in entries"
              :key="entry.id"
              :entry="entry"
              :expandable="true"
              :show-actions="true"
              :can-delete="canDelete"
              @view-details="onViewDetails"
              @delete="onDeleteEntry"
              @toggle="onEntryToggle"
            />
          </div>
        </div>

        <!-- Grid View -->
        <div v-else class="grid-view">
          <div class="entries-grid">
            <div v-for="entry in entries" :key="entry.id" class="grid-item">
              <BuildHistoryItem
                :entry="entry"
                :expandable="false"
                :show-actions="true"
                :can-delete="canDelete"
                @view-details="onViewDetails"
                @delete="onDeleteEntry"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="showPagination" class="pagination-container">
        <Paginator
          :first="paginationOffset"
          :rows="pagination.pageSize"
          :total-records="totalCount"
          :rows-per-page-options="[10, 20, 50, 100]"
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          @page="onPageChange"
        />
      </div>

      <!-- Load More (for infinite scroll) -->
      <div v-if="showLoadMore" class="load-more-container">
        <Button label="Load More" severity="secondary" :loading="isLoading" @click="loadMore" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { BuildHistoryEntry, PaginationOptions } from '@@/build-history'
import BuildHistoryItem from './BuildHistoryItem.vue'

interface Props {
  entries: BuildHistoryEntry[]
  isLoading?: boolean
  error?: string
  hasSubscriptionError?: boolean
  totalCount?: number
  pagination?: PaginationOptions
  canDelete?: boolean
  canStartBuild?: boolean
  showPagination?: boolean
  showLoadMore?: boolean
}

interface Emits {
  (e: 'load-more'): void
  (e: 'retry-load'): void
  (e: 'view-details', entry: BuildHistoryEntry): void
  (e: 'delete', entry: BuildHistoryEntry): void
  (e: 'start-build'): void
  (e: 'sort-change', sortBy: string, sortOrder: 'asc' | 'desc'): void
  (e: 'page-change', page: number, pageSize: number): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  error: undefined,
  hasSubscriptionError: false,
  totalCount: 0,
  canDelete: false,
  canStartBuild: false,
  showPagination: true,
  showLoadMore: false
})

const emit = defineEmits<Emits>()

// Local state
const viewMode = ref<'list' | 'grid'>('list')
const sortBy = ref<keyof BuildHistoryEntry>('startTime')
const sortOrder = ref<'asc' | 'desc'>('desc')

// Computed properties
const hasEntries = computed(() => props.entries.length > 0)

const paginationOffset = computed(() => {
  if (!props.pagination) return 0
  return (props.pagination.page - 1) * props.pagination.pageSize
})

// Sort options
const sortOptions = [
  { label: 'Start Time', value: 'startTime' },
  { label: 'End Time', value: 'endTime' },
  { label: 'Duration', value: 'duration' },
  { label: 'Project Name', value: 'projectName' },
  { label: 'Status', value: 'status' },
  { label: 'Created At', value: 'createdAt' }
]

// Methods
const retryLoad = () => {
  emit('retry-load')
}

const startNewBuild = () => {
  emit('start-build')
}

const onViewDetails = (entry: BuildHistoryEntry) => {
  emit('view-details', entry)
}

const onDeleteEntry = (entry: BuildHistoryEntry) => {
  emit('delete', entry)
}

const onEntryToggle = (entry: BuildHistoryEntry, expanded: boolean) => {
  // Handle entry expansion if needed
  console.log('Entry toggled:', entry.id, expanded)
}

const onSortChange = () => {
  emit('sort-change', sortBy.value, sortOrder.value)
}

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  emit('sort-change', sortBy.value, sortOrder.value)
}

const onPageChange = (event: any) => {
  const newPage = Math.floor(event.first / event.rows) + 1
  const newPageSize = event.rows
  emit('page-change', newPage, newPageSize)
}

const loadMore = () => {
  emit('load-more')
}

// Watch for external sort changes
watch(
  () => props.pagination,
  (newPagination) => {
    if (newPagination) {
      sortBy.value = newPagination.sortBy || 'startTime'
      sortOrder.value = newPagination.sortOrder || 'desc'
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.build-history-list {
  min-height: 400px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  color: #6c757d;
}

.loading-state {
  gap: 1rem;
}

.error-state {
  gap: 1.5rem;
}

.error-state i {
  font-size: 3rem;
  color: #dc3545;
}

.error-content h4 {
  margin: 0 0 0.5rem 0;
  color: #495057;
}

.error-content p {
  margin: 0 0 1.5rem 0;
}

.empty-state {
  gap: 1.5rem;
}

.empty-state i {
  font-size: 4rem;
  color: #dee2e6;
}

.empty-content h4 {
  margin: 0 0 0.5rem 0;
  color: #495057;
}

.empty-content p {
  margin: 0 0 1.5rem 0;
}

.history-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.results-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.results-count {
  color: #6c757d;
  font-size: 0.875rem;
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.view-mode {
  display: flex;
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  overflow: hidden;
}

.view-mode .p-button {
  border-radius: 0;
  border: none;
  margin: 0;
}

.view-mode .p-button.active {
  background: #007bff;
  color: #fff;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sort-controls label {
  font-weight: 500;
  color: #495057;
  font-size: 0.875rem;
  white-space: nowrap;
}

.sort-dropdown {
  min-width: 150px;
}

.entries-container {
  min-height: 300px;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.grid-view {
  padding: 1rem 0;
}

.entries-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 1.5rem;
}

.grid-item {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.grid-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.pagination-container {
  margin-top: 2rem;
}

.load-more-container {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .list-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }

  .results-info {
    justify-content: space-between;
  }

  .sort-controls {
    flex-wrap: wrap;
  }

  .entries-grid {
    grid-template-columns: 1fr;
  }

  .loading-state,
  .error-state,
  .empty-state {
    padding: 2rem 1rem;
  }
}

@media (max-width: 480px) {
  .view-mode {
    order: -1;
  }

  .sort-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .sort-dropdown {
    min-width: auto;
  }
}
</style>
