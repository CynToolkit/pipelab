<template>
  <div v-if="entry" class="build-details-inline">



      <!-- Tab Navigation -->
      <Tabs :value="defaultTab" class="details-tabs">
        <TabList>
          <Tab v-if="entry.version" value="results">Build Results</Tab>
          <Tab v-if="canUseHistory" value="steps">Execution Steps</Tab>

          <Tab v-if="canUseHistory && entry.error" value="error">Error Details</Tab>
          <Tab value="artifacts">Artifacts</Tab>

        </TabList>

        <TabPanels>
          <TabPanel v-if="entry.version" value="results">
            <div class="build-results-summary">
              <div class="results-header">
                <h3>Build {{ entry.version }}</h3>
                <BuildStatusBadge :status="entry.status" />
              </div>
              <h4>Artifacts</h4>
              <div v-if="!entry.artifacts?.length" class="no-artifacts"><p>No artifacts generated during this build.</p></div>
              <div v-else class="result-artifact-list">
                <div v-for="artifact in entry.artifacts" :key="artifact.id" class="result-artifact-row">
                  <div>
                    <strong>{{ artifactName(artifact) }}</strong>
                    <small v-if="'outputId' in artifact">{{ artifact.platform }} {{ artifact.architecture }} · {{ artifact.format }} · {{ artifact.producerStep }}</small>
                    <small>{{ artifact.path }}</small>
                  </div>
                  <div class="result-consumers">
                    <span v-for="delivery in entry.deliveries?.filter((item) => item.artifactId === artifact.id) || []" :key="delivery.id">
                      {{ delivery.destinationId }} / {{ delivery.slotId }} {{ delivery.status === 'completed' ? '✓' : '✕' }}
                    </span>
                  </div>
                </div>
              </div>
              <h4>Deliveries</h4>
              <div v-if="!entry.deliveries?.length" class="no-artifacts"><p>No deliveries recorded.</p></div>
              <div v-else class="result-delivery-list">
                <div v-for="delivery in entry.deliveries" :key="delivery.id" class="result-delivery-row">
                  <span>{{ delivery.destinationId }} / {{ delivery.slotId }}</span>
                  <BuildStatusBadge :status="delivery.status" size="small" />
                  <small v-if="delivery.error">{{ delivery.error }}</small>
                </div>
              </div>
            </div>
          </TabPanel>
          <TabPanel v-if="canUseHistory" value="steps">
            <div class="steps-container">
              <div v-if="!entry.steps || entry.steps.length === 0" class="no-steps">
                <p>No execution steps available.</p>
              </div>
              <div v-else class="steps-timeline">
                <div
                  v-for="(buildStep, index) in entry.steps || []"
                  :key="buildStep.id"
                  class="step-timeline-item"
                  :class="buildStep.status"
                >
                  <div class="step-timeline-marker">
                    <i :class="getStepIcon(buildStep.status)" class="step-icon"></i>
                    <div v-if="index < entry.steps.length - 1" class="step-connector"></div>
                  </div>
                  <div class="step-timeline-content">
                    <div class="step-header">
                      <h4 class="step-name">{{ buildStep.name }}</h4>
                      <div class="step-status-info">
                        <BuildStatusBadge :status="buildStep.status" size="small" />
                        <span v-if="buildStep.duration" class="step-duration">
                          {{ formatDuration(buildStep.duration) }}
                        </span>
                      </div>
                    </div>

                    <div class="step-details">
                      <div class="step-timing">
                        <span v-if="buildStep.startTime" class="start-time">
                          Started: {{ formatTime(buildStep.startTime) }}
                        </span>
                        <span v-if="buildStep.endTime" class="end-time">
                          Ended: {{ formatTime(buildStep.endTime) }}
                        </span>
                      </div>

                      <!-- Step Logs -->
                      <div v-if="buildStep.logs?.length > 0" class="step-logs">
                        <details class="logs-details">
                          <summary>View Logs ({{ buildStep.logs?.length || 0 }} entries)</summary>
                          <div class="logs-content">
                            <div
                              v-for="log in buildStep.logs || []"
                              :key="log.id"
                              class="log-entry"
                              :class="`log-${log.level || 'info'}`"
                            >
                              <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                              <span class="log-level">{{
                                (log.level || "info").toUpperCase()
                              }}</span>
                              <span class="log-message">{{
                                Array.isArray(log.message) ? log.message.join(" ") : log.message
                              }}</span>
                              <span v-if="log.source" class="log-source">({{ log.source }})</span>
                            </div>
                          </div>
                        </details>
                      </div>

                      <!-- Step Error -->
                      <div v-if="buildStep.error" class="step-error">
                        <details class="error-details">
                          <summary class="error-summary">
                            <i class="pi pi-exclamation-triangle"></i>
                            Error: {{ buildStep.error.message }}
                          </summary>
                          <div class="error-content">
                            <p class="error-message">{{ buildStep.error.message }}</p>
                            <div v-if="buildStep.error.stack" class="error-stack">
                              <h6>Stack Trace:</h6>
                              <pre>{{ buildStep.error.stack }}</pre>
                            </div>
                            <div v-if="buildStep.error.code" class="error-metadata">
                              <small><strong>Error Code:</strong> {{ buildStep.error.code }}</small>
                            </div>
                          </div>
                        </details>
                      </div>

                      <!-- Step Output -->
                      <div v-if="buildStep.output" class="step-output">
                        <details class="output-details">
                          <summary>Step Output</summary>
                          <div class="output-content">
                            <pre>{{ JSON.stringify(buildStep.output, null, 2) }}</pre>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel v-if="canUseHistory && entry.error" value="error">
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

          <TabPanel value="artifacts">
            <div class="artifacts-container p-4">
              <div v-if="!entry.artifacts || entry.artifacts.length === 0" class="no-artifacts">
                <p>No artifacts generated during this build.</p>
              </div>
              <div v-else class="artifacts-list flex flex-col gap-2">
                <div
                  v-for="artifact in entry.artifacts"
                  :key="artifact.id"
                  class="flex items-center gap-2 p-2 surface-ground border-round"
                >
                  <i class="pi pi-file"></i>
                  <span class="flex-grow-1 font-bold">{{ artifactName(artifact) }}</span>
                  <span class="text-sm text-secondary mr-2">{{ artifactFormat(artifact) }}</span>
                  <Button
                    icon="pi pi-folder-open"
                    label="Open Location"
                    size="small"
                    severity="secondary"
                    @click="openFolder(artifact.path)"
                  ></Button>
                </div>
              </div>
            </div>
          </TabPanel>


        </TabPanels>
      </Tabs>

    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { BuildHistoryEntry } from "@pipelab/shared";
import BuildStatusBadge from "./BuildStatusBadge.vue";
import { useBuildHistory } from "../store/build-history";

const buildHistoryStore = useBuildHistory();
const canUseHistory = computed(() => buildHistoryStore.canUseHistory);

interface Props {
  entry: BuildHistoryEntry | null;
}

const props = defineProps<Props>();
const defaultTab = computed(() => props.entry?.version ? "results" : canUseHistory.value ? "steps" : "artifacts");

const artifactName = (artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number]) =>
  "outputId" in artifact ? artifact.outputId : artifact.name;

const artifactFormat = (artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number]) =>
  "outputId" in artifact
    ? `${artifact.format}${artifact.size ? ` · ${(artifact.size / 1024 / 1024).toFixed(2)} MB` : ""}`
    : artifact.type === "folder"
      ? "Folder"
      : artifact.size
        ? `${(artifact.size / 1024 / 1024).toFixed(2)} MB`
        : "Unknown size";

// Methods
const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

const openFolder = async (path: string) => {
  if ((window as any).pipelab) {
    await (window as any).pipelab.showItemInFolder(path);
  }
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString();
};

const formatDuration = (duration: number): string => {
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

const getStepIcon = (status: string): string => {
  const icons = {
    pending: "pi pi-clock",
    running: "pi pi-spin pi-spinner",
    completed: "pi pi-check",
    failed: "pi pi-times",
    cancelled: "pi pi-stop",
  };
  return icons[status as keyof typeof icons] || "pi pi-circle";
};


</script>

<style scoped>
.build-details-modal {
  max-height: 80vh;
  overflow-y: auto;
}

.build-results-summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.results-header,
.result-artifact-row,
.result-delivery-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.build-results-summary h3,
.build-results-summary h4 {
  margin: 0;
}

.result-artifact-list,
.result-delivery-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-artifact-row,
.result-delivery-row {
  align-items: flex-start;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 0.65rem;
}

.result-artifact-row > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.25rem;
}

.result-artifact-row small,
.result-delivery-row small {
  color: var(--text-color-secondary);
  overflow-wrap: anywhere;
}

.result-consumers {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
  color: var(--text-color-secondary);
  font-size: 0.8rem;
}


.details-tabs {
  margin-bottom: 2rem;
}

.steps-container,
.error-container,
.metadata-container {
  max-height: 60vh;
  overflow-y: auto;
}

.no-steps,
.no-logs,
.no-metadata {
  text-align: center;
  padding: 3rem;
  color: var(--text-color-secondary);
}

.steps-timeline {
  position: relative;
  padding-left: 2rem;
}

.step-timeline-item {
  position: relative;
  margin-bottom: 1rem;
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
  background: var(--surface-card);
  border: 2px solid var(--surface-border);
  border-radius: 50%;
  padding: 0.5rem;
  font-size: 1.2rem;
  color: var(--text-color-secondary);
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
  background: var(--surface-border);
  margin-top: 0.5rem;
}

.step-timeline-item:last-child .step-connector {
  display: none;
}

.step-timeline-content {
  background: transparent;
  padding: 0.5rem 1rem;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--surface-border);
}

.step-name {
  margin: 0;
  color: var(--text-color);
  font-size: 1.1rem;
}

.step-status-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step-duration {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.step-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-timing {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.step-logs,
.step-error,
.step-output {
  margin-top: 0.5rem;
}

.logs-details,
.error-details,
.output-details {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
}

.logs-details summary,
.error-details summary,
.output-details summary {
  padding: 0.75rem;
  background: var(--surface-ground);
  cursor: pointer;
  font-weight: 500;
  color: var(--text-color);
}

.logs-details summary:hover,
.error-details summary:hover,
.output-details summary:hover {
  background: var(--surface-hover);
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
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.875rem;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-time {
  color: var(--text-color-secondary);
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
  color: var(--text-color);
}

.log-source {
  color: var(--text-color-secondary);
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
  background: var(--surface-ground);
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--text-color);
  overflow-x: auto;
  margin: 0.5rem 0 0 0;
}

.error-metadata {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #f5c6cb;
}

.metadata-content pre {
  background: var(--surface-ground);
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--text-color);
  overflow-x: auto;
  margin: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--surface-border);
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
