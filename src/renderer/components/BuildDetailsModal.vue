<template>
  <Dialog
    :visible="visible"
    modal
    :header="`Build Details - ${entry?.projectName || 'Unknown'}`"
    :style="{ width: '90vw', maxWidth: '1200px' }"
    :closable="true"
    @update:visible="onHide"
  >
    <div class="build-details-modal">
      <!-- Build Overview -->
      <div class="build-overview">
        <div class="overview-header">
          <div class="build-title">
            <h3>{{ entry.projectName }}</h3>
            <BuildStatusBadge :status="entry.status" size="large" />
          </div>
          <div class="build-meta">
            <div class="meta-item">
              <label>Project ID:</label>
              <span>{{ entry.projectId }}</span>
            </div>
            <div class="meta-item">
              <label>Started:</label>
              <span>{{ formatDateTime(entry.startTime) }}</span>
            </div>
            <div v-if="entry.endTime" class="meta-item">
              <label>Ended:</label>
              <span>{{ formatDateTime(entry.endTime) }}</span>
            </div>
            <div v-if="entry.duration" class="meta-item">
              <label>Duration:</label>
              <span>{{ formatDuration(entry.duration) }}</span>
            </div>
            <div class="meta-item">
              <label>Progress:</label>
              <span>{{ entry.completedSteps }}/{{ entry.totalSteps }} steps</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <TabView class="details-tabs">
        <TabPanel value="steps" header="Execution Steps">
          <div class="steps-container">
            <div v-if="entry.steps.length === 0" class="no-steps">
              <p>No execution steps available.</p>
            </div>
            <div v-else class="steps-timeline">
              <div
                v-for="(step, index) in entry.steps"
                :key="step.id"
                class="step-timeline-item"
                :class="step.status"
              >
                <div class="step-timeline-marker">
                  <i :class="getStepIcon(step.status)" class="step-icon"></i>
                  <div v-if="index < entry.steps.length - 1" class="step-connector"></div>
                </div>
                <div class="step-timeline-content">
                  <div class="step-header">
                    <h4 class="step-name">{{ step.name }}</h4>
                    <div class="step-status-info">
                      <BuildStatusBadge :status="step.status" size="small" />
                      <span v-if="step.duration" class="step-duration">
                        {{ formatDuration(step.duration) }}
                      </span>
                    </div>
                  </div>

                  <div class="step-details">
                    <div class="step-timing">
                      <span v-if="step.startTime" class="start-time">
                        Started: {{ formatTime(step.startTime) }}
                      </span>
                      <span v-if="step.endTime" class="end-time">
                        Ended: {{ formatTime(step.endTime) }}
                      </span>
                    </div>

                    <!-- Step Logs -->
                    <div v-if="step.logs.length > 0" class="step-logs">
                      <details class="logs-details">
                        <summary>View Logs ({{ step.logs.length }} entries)</summary>
                        <div class="logs-content">
                          <div
                            v-for="log in step.logs"
                            :key="log.id"
                            class="log-entry"
                            :class="`log-${log.level}`"
                          >
                            <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                            <span class="log-level">{{ log.level.toUpperCase() }}</span>
                            <span class="log-message">{{ log.message }}</span>
                            <span v-if="log.source" class="log-source">({{ log.source }})</span>
                          </div>
                        </div>
                      </details>
                    </div>

                    <!-- Step Error -->
                    <div v-if="step.error" class="step-error">
                      <details class="error-details">
                        <summary class="error-summary">
                          <i class="pi pi-exclamation-triangle"></i>
                          Error: {{ step.error.message }}
                        </summary>
                        <div class="error-content">
                          <p class="error-message">{{ step.error.message }}</p>
                          <div v-if="step.error.stack" class="error-stack">
                            <h6>Stack Trace:</h6>
                            <pre>{{ step.error.stack }}</pre>
                          </div>
                          <div v-if="step.error.code" class="error-metadata">
                            <small><strong>Error Code:</strong> {{ step.error.code }}</small>
                          </div>
                        </div>
                      </details>
                    </div>

                    <!-- Step Output -->
                    <div v-if="step.output" class="step-output">
                      <details class="output-details">
                        <summary>Step Output</summary>
                        <div class="output-content">
                          <pre>{{ JSON.stringify(step.output, null, 2) }}</pre>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="logs" header="Build Logs">
          <div class="logs-container">
            <div v-if="entry.logs.length === 0" class="no-logs">
              <p>No build logs available.</p>
            </div>
            <div v-else class="logs-list">
              <div
                v-for="log in entry.logs"
                :key="log.id"
                class="log-entry"
                :class="`log-${log.level}`"
              >
                <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                <span class="log-level">{{ log.level.toUpperCase() }}</span>
                <span class="log-message">{{ log.message }}</span>
                <span v-if="log.source" class="log-source">({{ log.source }})</span>
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel v-if="entry.error" value="error" header="Error Details">
          <div class="error-container">
            <div class="error-header">
              <h4>Build Error</h4>
              <BuildStatusBadge status="failed" size="medium" />
            </div>
            <div class="error-content">
              <div class="error-message">
                <strong>Message:</strong>
                <p>{{ entry.error.message }}</p>
              </div>
              <div v-if="entry.error.stack" class="error-stack">
                <strong>Stack Trace:</strong>
                <pre>{{ entry.error.stack }}</pre>
              </div>
              <div v-if="entry.error.code" class="error-metadata">
                <strong>Error Code:</strong> {{ entry.error.code }}
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="metadata" header="Metadata">
          <div class="metadata-container">
            <div v-if="!entry.metadata" class="no-metadata">
              <p>No metadata available.</p>
            </div>
            <div v-else class="metadata-content">
              <pre>{{ JSON.stringify(entry.metadata, null, 2) }}</pre>
            </div>
          </div>
        </TabPanel>
      </TabView>

      <!-- Modal Actions -->
      <div class="modal-actions">
        <Button label="Close" severity="secondary" @click="closeModal" />
        <Button
          v-if="canRetry && entry.status === 'failed'"
          label="Retry Build"
          severity="info"
          @click="retryBuild"
        />
        <Button v-if="canDelete" label="Delete Entry" severity="danger" @click="deleteEntry" />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import type { BuildHistoryEntry } from '@@/build-history'
import BuildStatusBadge from './BuildStatusBadge.vue'

interface Props {
  entry: BuildHistoryEntry | null
  visible: boolean
  canDelete?: boolean
  canRetry?: boolean
}

interface Emits {
  (e: 'hide'): void
  (e: 'retry', entry: BuildHistoryEntry): void
  (e: 'delete', entry: BuildHistoryEntry): void
}

const props = withDefaults(defineProps<Props>(), {
  canDelete: false,
  canRetry: false
})

const emit = defineEmits<Emits>()

// Methods
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

const getStepIcon = (status: string): string => {
  const icons = {
    pending: 'pi pi-clock',
    running: 'pi pi-spin pi-spinner',
    completed: 'pi pi-check',
    failed: 'pi pi-times',
    cancelled: 'pi pi-stop'
  }
  return icons[status as keyof typeof icons] || 'pi pi-circle'
}

const closeModal = () => {
  emit('hide')
}

const onHide = () => {
  emit('hide')
}

const retryBuild = () => {
  if (props.entry) {
    emit('retry', props.entry)
  }
}

const deleteEntry = () => {
  if (props.entry) {
    emit('delete', props.entry)
  }
}
</script>

<style scoped>
.build-details-modal {
  max-height: 80vh;
  overflow-y: auto;
}

.build-overview {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e9ecef;
}

.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
}

.build-title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.build-title h3 {
  margin: 0;
  color: #495057;
  font-size: 1.5rem;
}

.build-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meta-item label {
  font-weight: 600;
  color: #6c757d;
  font-size: 0.875rem;
}

.meta-item span {
  color: #495057;
}

.details-tabs {
  margin-bottom: 2rem;
}

.steps-container,
.logs-container,
.error-container,
.metadata-container {
  max-height: 50vh;
  overflow-y: auto;
}

.no-steps,
.no-logs,
.no-metadata {
  text-align: center;
  padding: 3rem;
  color: #6c757d;
}

.steps-timeline {
  position: relative;
  padding-left: 2rem;
}

.step-timeline-item {
  position: relative;
  margin-bottom: 2rem;
  padding-left: 1rem;
}

.step-timeline-marker {
  position: absolute;
  left: -2rem;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.step-icon {
  background: #fff;
  border: 2px solid #e9ecef;
  border-radius: 50%;
  padding: 0.5rem;
  font-size: 1.2rem;
  color: #6c757d;
}

.step-timeline-item.completed .step-icon {
  border-color: #28a745;
  color: #28a745;
}

.step-timeline-item.failed .step-icon {
  border-color: #dc3545;
  color: #dc3545;
}

.step-timeline-item.running .step-icon {
  border-color: #007bff;
  color: #007bff;
}

.step-timeline-item.cancelled .step-icon {
  border-color: #6c757d;
  color: #6c757d;
}

.step-timeline-item.pending .step-icon {
  border-color: #ffc107;
  color: #ffc107;
}

.step-connector {
  width: 2px;
  height: 100%;
  background: #e9ecef;
  margin-top: 0.5rem;
}

.step-timeline-item:last-child .step-connector {
  display: none;
}

.step-timeline-content {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1rem;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e9ecef;
}

.step-name {
  margin: 0;
  color: #495057;
  font-size: 1.1rem;
}

.step-status-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step-duration {
  font-size: 0.875rem;
  color: #6c757d;
}

.step-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.step-timing {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: #6c757d;
}

.step-logs,
.step-error,
.step-output {
  margin-top: 1rem;
}

.logs-details,
.error-details,
.output-details {
  border: 1px solid #e9ecef;
  border-radius: 6px;
  overflow: hidden;
}

.logs-details summary,
.error-details summary,
.output-details summary {
  padding: 0.75rem;
  background: #f8f9fa;
  cursor: pointer;
  font-weight: 500;
  color: #495057;
}

.logs-details summary:hover,
.error-details summary:hover,
.output-details summary:hover {
  background: #e9ecef;
}

.logs-content,
.error-content,
.output-content {
  padding: 1rem;
  max-height: 300px;
  overflow-y: auto;
}

.log-entry {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f8f9fa;
  font-size: 0.875rem;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-time {
  color: #6c757d;
  font-family: monospace;
}

.log-level {
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-size: 0.75rem;
}

.log-debug {
  background: #e9ecef;
  color: #6c757d;
}

.log-info {
  background: #cce7ff;
  color: #0066cc;
}

.log-warn {
  background: #fff3cd;
  color: #856404;
}

.log-error {
  background: #f8d7da;
  color: #721c24;
}

.log-message {
  color: #495057;
}

.log-source {
  color: #6c757d;
  font-style: italic;
}

.error-summary {
  color: #721c24;
}

.error-summary i {
  margin-right: 0.5rem;
}

.error-message {
  color: #721c24;
  margin: 0 0 1rem 0;
}

.error-stack pre {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  color: #495057;
  overflow-x: auto;
  margin: 0.5rem 0 0 0;
}

.error-metadata {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #f5c6cb;
}

.metadata-content pre {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  color: #495057;
  overflow-x: auto;
  margin: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e9ecef;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .overview-header {
    flex-direction: column;
    align-items: stretch;
  }

  .build-meta {
    grid-template-columns: 1fr;
  }

  .step-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }

  .modal-actions {
    flex-direction: column;
  }
}
</style>
