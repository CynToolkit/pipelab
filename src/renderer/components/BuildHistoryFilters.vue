<template>
  <div class="build-history-filters">
    <div class="filters-header">
      <h3>Filters</h3>
      <Button
        v-tooltip.top="'Clear all filters'"
        text
        severity="secondary"
        size="small"
        @click="resetFilters"
      >
        <i class="pi pi-times"></i>
        Clear
      </Button>
    </div>

    <div class="filters-content">
      <!-- Search Input -->
      <div class="filter-group">
        <label for="search">Search Projects</label>
        <InputText
          id="search"
          v-model="localFilters.projectName"
          placeholder="Search by project name..."
          class="w-full"
          @input="onFiltersChange"
        />
      </div>

      <!-- Status Filter -->
      <div class="filter-group">
        <label for="status">Status</label>
        <Dropdown
          id="status"
          v-model="localFilters.status"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          placeholder="All statuses"
          class="w-full"
          show-clear
          @change="onFiltersChange"
        />
      </div>

      <!-- Date Range Filters -->
      <div class="filter-group">
        <label for="startDate">Start Date</label>
        <Calendar
          id="startDate"
          v-model="startDateObject"
          placeholder="From date"
          class="w-full"
          show-icon
          date-format="yy-mm-dd"
        />
      </div>

      <div class="filter-group">
        <label for="endDate">End Date</label>
        <Calendar
          id="endDate"
          v-model="endDateObject"
          placeholder="To date"
          class="w-full"
          show-icon
          date-format="yy-mm-dd"
        />
      </div>

      <!-- Project Filter -->
      <div class="filter-group">
        <label for="projectId">Project ID</label>
        <InputText
          id="projectId"
          v-model="localFilters.projectId"
          placeholder="Filter by project ID..."
          class="w-full"
          @input="onFiltersChange"
        />
      </div>

      <!-- User Filter -->
      <div class="filter-group">
        <label for="userId">User ID</label>
        <InputText
          id="userId"
          v-model="localFilters.userId"
          placeholder="Filter by user ID..."
          class="w-full"
          @input="onFiltersChange"
        />
      </div>
    </div>

    <!-- Active Filters Display -->
    <div class="active-filters">
      <div class="active-filters-list">
        <Chip
          v-for="filter in activeFilters"
          :key="filter.key"
          :label="filter.label"
          removable
          @remove="removeFilter(filter.key)"
        />
      </div>
    </div>

    <!-- Export Options -->
    <div class="export-section">
      <h4>Export</h4>
      <div class="export-buttons">
        <Button
          label="Export CSV"
          severity="secondary"
          size="small"
          :disabled="!hasActiveFilters && !hasEntries"
          @click="exportData('csv')"
        >
          <i class="pi pi-download"></i>
        </Button>
        <Button
          label="Export JSON"
          severity="secondary"
          size="small"
          :disabled="!hasActiveFilters && !hasEntries"
          @click="exportData('json')"
        >
          <i class="pi pi-download"></i>
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { BuildFilters } from '@@/build-history'

interface Props {
  filters: BuildFilters
  hasEntries?: boolean
}

interface Emits {
  (e: 'update:filters', filters: BuildFilters): void
  (e: 'export', format: 'csv' | 'json'): void
}

const props = withDefaults(defineProps<Props>(), {
  hasEntries: false
})

const emit = defineEmits<Emits>()

// Local state for filters with computed date properties
const localFilters = ref<BuildFilters>({ ...props.filters })

// Computed date objects for PrimeVue Calendar components
const startDateObject = computed({
  get: () => (localFilters.value.startDate ? new Date(localFilters.value.startDate) : null),
  set: (date: Date | null) => {
    localFilters.value.startDate = date ? date.getTime() : undefined
    onFiltersChange()
  }
})

const endDateObject = computed({
  get: () => (localFilters.value.endDate ? new Date(localFilters.value.endDate) : null),
  set: (date: Date | null) => {
    localFilters.value.endDate = date ? date.getTime() : undefined
    onFiltersChange()
  }
})

// Status options for dropdown
const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' }
]

// Computed properties
const hasActiveFilters = computed(() => {
  return !!(
    localFilters.value.projectName ||
    localFilters.value.status ||
    localFilters.value.startDate ||
    localFilters.value.endDate ||
    localFilters.value.projectId ||
    localFilters.value.userId
  )
})

const activeFilters = computed(() => {
  const filters: Array<{ key: string; label: string }> = []

  if (localFilters.value.projectName) {
    filters.push({
      key: 'projectName',
      label: `Project: ${localFilters.value.projectName}`
    })
  }

  if (localFilters.value.status && localFilters.value.status !== 'all') {
    filters.push({
      key: 'status',
      label: `Status: ${localFilters.value.status}`
    })
  }

  if (localFilters.value.startDate) {
    filters.push({
      key: 'startDate',
      label: `From: ${new Date(localFilters.value.startDate).toLocaleDateString()}`
    })
  }

  if (localFilters.value.endDate) {
    filters.push({
      key: 'endDate',
      label: `To: ${new Date(localFilters.value.endDate).toLocaleDateString()}`
    })
  }

  if (localFilters.value.projectId) {
    filters.push({
      key: 'projectId',
      label: `Project ID: ${localFilters.value.projectId}`
    })
  }

  if (localFilters.value.userId) {
    filters.push({
      key: 'userId',
      label: `User ID: ${localFilters.value.userId}`
    })
  }

  return filters
})

// Methods
const onFiltersChange = () => {
  emit('update:filters', { ...localFilters.value })
}

const resetFilters = () => {
  localFilters.value = {}
  emit('update:filters', {})
}

const removeFilter = (key: string) => {
  switch (key) {
    case 'projectName':
      localFilters.value.projectName = undefined
      break
    case 'status':
      localFilters.value.status = undefined
      break
    case 'startDate':
      localFilters.value.startDate = undefined
      break
    case 'endDate':
      localFilters.value.endDate = undefined
      break
    case 'projectId':
      localFilters.value.projectId = undefined
      break
    case 'userId':
      localFilters.value.userId = undefined
      break
  }
  emit('update:filters', { ...localFilters.value })
}

const exportData = (format: 'csv' | 'json') => {
  emit('export', format)
}

// Watch for external filter changes
watch(
  () => props.filters,
  (newFilters) => {
    localFilters.value = { ...newFilters }
  },
  { deep: true }
)
</script>

<style scoped>
.build-history-filters {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.filters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e9ecef;
}

.filters-header h3 {
  margin: 0;
  color: #495057;
  font-size: 1.25rem;
  font-weight: 600;
}

.filters-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-group label {
  font-weight: 500;
  color: #495057;
  font-size: 0.875rem;
}

.active-filters {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.active-filters-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.export-section {
  padding-top: 1rem;
  border-top: 1px solid #e9ecef;
}

.export-section h4 {
  margin: 0 0 1rem 0;
  color: #495057;
  font-size: 1rem;
  font-weight: 600;
}

.export-buttons {
  display: flex;
  gap: 0.5rem;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .build-history-filters {
    padding: 1rem;
  }

  .filters-content {
    grid-template-columns: 1fr;
  }

  .filters-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }

  .export-buttons {
    flex-direction: column;
  }
}
</style>
