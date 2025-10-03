<template>
  <div
    class="build-history-item"
    :class="{ expanded, 'is-clickable': expandable }"
    @click="handleClick"
  >
    <div class="item-header">
      <div class="item-main-info">
        <div class="project-info">
          <h4 class="project-name">{{ entry.projectName }}</h4>
          <span class="project-path">{{ entry.projectPath }}</span>
        </div>
        <div class="status-and-time">
          <BuildStatusBadge :status="entry.status" size="medium" />
          <span class="start-time">{{ formatDate(entry.startTime) }}</span>
        </div>
      </div>

      <div class="item-actions">
        <Button
          v-if="showActions"
          v-tooltip.top="'View Details'"
          text
          severity="secondary"
          size="small"
          @click.stop="viewDetails"
        >
          <i class="pi pi-eye"></i>
        </Button>
        <Button
          v-if="showActions && canDelete"
          v-tooltip.top="'Delete Entry'"
          text
          severity="danger"
          size="small"
          @click.stop="deleteEntry"
        >
          <i class="pi pi-trash"></i>
        </Button>
        <i
          v-if="expandable"
          class="pi expand-icon"
          :class="expanded ? 'pi-chevron-up' : 'pi-chevron-down'"
        ></i>
      </div>
    </div>

    <!-- Expanded Content -->
    <div v-if="expanded" class="item-expanded">
      <div class="expanded-content">
        <!-- Basic Information -->
        <div class="info-section">
          <h5>Build Information</h5>
          <div class="info-grid">
            <div class="info-item">
              <label>Project ID:</label>
              <span>{{ entry.projectId }}</span>
            </div>
            <div class="info-item">
              <label>Status:</label>
              <BuildStatusBadge :status="entry.status" />
            </div>
            <div class="info-item">
              <label>Started:</label>
              <span>{{ formatDateTime(entry.startTime) }}</span>
            </div>
            <div v-if="entry.endTime" class="info-item">
              <label>Ended:</label>
              <span>{{ formatDateTime(entry.endTime) }}</span>
            </div>
            <div v-if="entry.duration" class="info-item">
              <label>Duration:</label>
              <span>{{ formatDuration(entry.duration) }}</span>
            </div>
            <div class="info-item">
              <label>Progress:</label>
              <span>{{ entry.completedSteps }}/{{ entry.totalSteps }} steps</span>
            </div>
          </div>
        </div>

        <!-- Steps Overview -->
        <div v-if="entry.steps.length > 0" class="steps-section">
          <h5>Execution Steps</h5>
          <div class="steps-list">
            <div
              v-for="step in entry.steps.slice(0, showAllSteps ? undefined : 3)"
              :key="step.id"
              class="step-item"
              :class="step.status"
            >
              <div class="step-header">
                <span class="step-name">{{ step.name }}</span>
                <BuildStatusBadge :status="step.status" size="small" />
              </div>
              <div class="step-details">
                <span v-if="step.duration" class="step-duration">
                  {{ formatDuration(step.duration) }}
                </span>
                <span v-if="step.startTime" class="step-time">
                  {{ formatTime(step.startTime) }}
                </span>
              </div>
            </div>
            <div v-if="entry.steps.length > 3 && !showAllSteps" class="steps-more">
              <Button text size="small" @click.stop="showAllSteps = true">
                Show {{ entry.steps.length - 3 }} more steps...
              </Button>
            </div>
          </div>
        </div>

        <!-- Error Information -->
        <div v-if="entry.error" class="error-section">
          <h5>Error Details</h5>
          <div class="error-content">
            <p class="error-message">{{ entry.error.message }}</p>
            <details v-if="entry.error.stack" class="error-stack">
              <summary>Stack Trace</summary>
              <pre>{{ entry.error.stack }}</pre>
            </details>
          </div>
        </div>

        <!-- Metadata -->
        <div v-if="entry.metadata" class="metadata-section">
          <h5>Metadata</h5>
          <div class="metadata-content">
            <pre>{{ JSON.stringify(entry.metadata, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { BuildHistoryEntry } from '@@/build-history'
import BuildStatusBadge from './BuildStatusBadge.vue'

interface Props {
  entry: BuildHistoryEntry
  expandable?: boolean
  showActions?: boolean
  canDelete?: boolean
}

interface Emits {
  (e: 'view-details', entry: BuildHistoryEntry): void
  (e: 'delete', entry: BuildHistoryEntry): void
  (e: 'toggle', entry: BuildHistoryEntry, expanded: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  expandable: true,
  showActions: true,
  canDelete: false
})

const emit = defineEmits<Emits>()

// Local state
const expanded = ref(false)
const showAllSteps = ref(false)

// Computed properties

// Methods
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString()
}

const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString()
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString()
}

const formatDuration = (duration: number): string => {
  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

const handleClick = () => {
  if (props.expandable) {
    expanded.value = !expanded.value
    emit('toggle', props.entry, expanded.value)
  }
}

const viewDetails = () => {
  emit('view-details', props.entry)
}

const deleteEntry = () => {
  emit('delete', props.entry)
}
</script>

<style scoped>
.build-history-item {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  transition: all 0.2s ease;
  overflow: hidden;
}

.build-history-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-color: #007bff;
}

.build-history-item.is-clickable {
  cursor: pointer;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  gap: 1rem;
}

.item-main-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.project-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #495057;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-path {
  font-size: 0.875rem;
  color: #6c757d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-and-time {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.start-time {
  font-size: 0.875rem;
  color: #6c757d;
  white-space: nowrap;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.expand-icon {
  color: #6c757d;
  font-size: 1.2rem;
  transition: transform 0.2s ease;
}

.build-history-item.expanded .expand-icon {
  transform: rotate(180deg);
}

.item-expanded {
  border-top: 1px solid #e9ecef;
  background: #f8f9fa;
}

.expanded-content {
  padding: 1.5rem;
}

.info-section,
.steps-section,
.error-section,
.metadata-section {
  margin-bottom: 1.5rem;
}

.info-section h5,
.steps-section h5,
.error-section h5,
.metadata-section h5 {
  margin: 0 0 1rem 0;
  color: #495057;
  font-size: 1rem;
  font-weight: 600;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow: hidden;
}

.info-item label {
  font-weight: 500;
  color: #6c757d;
  font-size: 0.875rem;
}

.info-item span {
  color: #495057;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.step-item {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 0.75rem;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.step-name {
  font-weight: 500;
  color: #495057;
}

.step-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  color: #6c757d;
}

.steps-more {
  text-align: center;
  margin-top: 0.5rem;
}

.error-content {
  background: #fff;
  border: 1px solid #f5c6cb;
  border-radius: 6px;
  padding: 1rem;
}

.error-message {
  color: #721c24;
  margin: 0 0 1rem 0;
}

.error-stack {
  margin: 0;
}

.error-stack summary {
  color: #721c24;
  font-weight: 500;
  cursor: pointer;
  padding: 0.5rem 0;
}

.error-stack pre {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  color: #495057;
  overflow-x: auto;
  margin-top: 0.5rem;
}

.metadata-content {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 1rem;
}

.metadata-content pre {
  margin: 0;
  font-size: 0.875rem;
  color: #495057;
  overflow-x: auto;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .item-header {
    flex-direction: column;
    align-items: stretch;
  }

  .item-main-info {
    order: 1;
  }

  .item-actions {
    order: 2;
    justify-content: space-between;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .status-and-time {
    justify-content: space-between;
  }
}
</style>
