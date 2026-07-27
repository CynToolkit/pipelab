<template>
  <div class="artifacts-quick-view">
    <div class="header">
      <h3>Recent Artifacts</h3>
      <p>Upgrade to Premium for full build history, logs, and advanced analytics.</p>
    </div>

    <div v-if="buildHistoryStore.entries.length === 0" class="no-artifacts">
      <p>No recent builds found.</p>
    </div>

    <div v-else class="artifacts-list">
      <div v-for="entry in buildHistoryStore.entries" :key="entry.id" class="artifact-card">
        <div class="card-header">
          <span class="project-name">{{ entry.projectName }}</span>
          <span class="date">{{ new Date(entry.startTime).toLocaleString() }}</span>
        </div>
        <div class="card-body">
          <div class="status" :class="entry.status">
            {{ entry.status }}
          </div>
          <div v-if="entry.artifacts && entry.artifacts.length > 0" class="artifacts">
            <Button
              v-for="artifact in entry.artifacts"
              :key="artifact.id"
              :label="'Open ' + artifact.name"
              icon="pi pi-folder-open"
              severity="secondary"
              size="small"
              @click="openFolder(artifact.path)"
            />
          </div>
          <div v-else class="no-artifacts-msg">
            No artifacts generated
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useBuildHistory } from "../store/build-history";
import Button from "primevue/button";
import { useAPI } from "@renderer/composables/api";

const buildHistoryStore = useBuildHistory();
const api = useAPI();

const openFolder = async (path: string) => {
  if ((window as any).pipelab) {
    await (window as any).pipelab.showItemInFolder(path);
  }
};
</script>

<style scoped>
.artifacts-quick-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
}

.header {
  text-align: center;
  color: #495057;
}

.header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
}

.header p {
  margin: 0;
  color: #6c757d;
}

.artifacts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  max-height: calc(80vh - 200px);
}

.artifact-card {
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
  padding: 1rem;
  background-color: var(--surface-card);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
  padding-bottom: 0.5rem;
}

.project-name {
  font-weight: bold;
}

.date {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
}

.status {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: bold;
  text-transform: capitalize;
}

.status.completed {
  background-color: var(--green-100);
  color: var(--green-700);
}

.status.failed {
  background-color: var(--red-100);
  color: var(--red-700);
}

.status.running {
  background-color: var(--blue-100);
  color: var(--blue-700);
}

.artifacts {
  display: flex;
  gap: 0.5rem;
}

.no-artifacts-msg {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
  font-style: italic;
}

.no-artifacts {
  text-align: center;
  padding: 2rem;
  color: var(--text-color-secondary);
}
</style>
