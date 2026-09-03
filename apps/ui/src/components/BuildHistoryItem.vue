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
          <span class="start-time text-color-secondary">{{ formatDateTime(entry.startTime) }}</span>
          <span v-if="entry.duration" class="duration text-color-secondary">({{ formatDuration(entry.duration) }})</span>
        </div>
      </div>

      <div class="item-actions">

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
    <div v-if="expanded" class="item-expanded" @click.stop>
      <div class="expanded-content">


        <BuildDetails :entry="entry" />


      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from "vue";
import type { BuildHistoryEntry } from "@pipelab/shared";
import BuildStatusBadge from "./BuildStatusBadge.vue";
import BuildDetails from "./BuildDetails.vue";
import { OpenUpgradeDialogKey } from "../utils/injection-keys";
import { useAuth } from "../store/auth";

interface Props {
  entry: BuildHistoryEntry;
  expandable?: boolean;
  showActions?: boolean;
  canDelete?: boolean;
}

interface Emits {

  (e: "delete", entry: BuildHistoryEntry): void;
  (e: "toggle", entry: BuildHistoryEntry, expanded: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
  expandable: true,
  showActions: true,
  canDelete: false,
});

const emit = defineEmits<Emits>();

// Composables
const authStore = useAuth();
const openUpgradeDialog = inject(OpenUpgradeDialogKey) as () => void;

// Local state
const expanded = ref(false);
const showAllSteps = ref(false);

// Computed properties

// Methods
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
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

const handleClick = () => {
  if (props.expandable) {
    expanded.value = !expanded.value;
    emit("toggle", props.entry, expanded.value);
  }
};

const deleteEntry = () => {
  emit("delete", props.entry);
};
</script>

<style scoped>
.build-history-item {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  transition: all 0.2s ease;
  overflow: hidden;
}

:root.dark .build-history-item {
  background: var(--p-surface-900);
  border-color: var(--p-surface-800);
}

.build-history-item:hover {
  border-color: var(--p-surface-300);
}

:root.dark .build-history-item:hover {
  border-color: var(--p-surface-700);
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

:root.dark .project-name {
  color: var(--p-text-color);
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
  gap: 0.5rem;
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

:root.dark .item-expanded {
  border-top-color: var(--p-surface-800);
  background: var(--p-surface-950);
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

:root.dark .info-section h5,
:root.dark .steps-section h5,
:root.dark .error-section h5,
:root.dark .metadata-section h5 {
  color: var(--p-text-color);
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

:root.dark .info-item span {
  color: var(--p-text-color);
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

:root.dark .step-item {
  background: var(--p-surface-900);
  border-color: var(--p-surface-800);
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

:root.dark .step-name {
  color: var(--p-text-color);
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

:root.dark .error-content {
  background: var(--p-red-950, #801818);
  border-color: var(--p-red-800, #b91c1c);
}

.error-message {
  color: #721c24;
  margin: 0;
}

:root.dark .error-message {
  color: var(--p-red-200, #ffc9c9);
}

.metadata-content {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 1rem;
}

:root.dark .metadata-content {
  background: var(--p-surface-900);
  border-color: var(--p-surface-800);
}

.metadata-content pre {
  margin: 0;
  font-size: 0.875rem;
  color: #495057;
  overflow-x: auto;
}

:root.dark .metadata-content pre {
  color: var(--p-text-color);
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
