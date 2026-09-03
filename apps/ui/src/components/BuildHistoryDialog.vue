<template>
  <Dialog
    :visible="visible"
    modal
    :header="'Build History'"
    :style="{ width: '90vw', height: '80vh' }"
    :closable="true"
    @update:visible="$emit('update:visible', false)"
  >
    <div class="build-history-dialog">
      <!-- Loading state -->
      <div v-if="true && authStore.isLoadingSubscriptions" class="loading-state">
        <ProgressSpinner />
        <p>Loading build history...</p>
      </div>

      <!-- Main Content (shown for everyone) -->
      <div v-else class="main-content">
        <div v-if="!buildHistoryStore.canUseHistory" class="unauthorized-banner p-3 mb-4 surface-ground border-round flex align-items-center justify-content-between">
          <div>
            <h4 class="m-0 mb-1">Preview Mode</h4>
            <p class="m-0 text-color-secondary">Upgrade to Premium for full execution steps, detailed logs, and advanced analytics.</p>
          </div>
          <Button label="Upgrade Now" severity="primary" size="small" @click="openUpgradeDialog" />
        </div>

        <!-- Build History List -->
        <BuildHistoryList
          :entries="buildHistoryStore.entries"
          :is-loading="buildHistoryStore.isLoading"
          :error="buildHistoryStore.error"
          :total-count="totalCount"
          :can-delete="true"
          :can-start-build="false"
          @delete="onDeleteEntry"
          @clear-all="onClearAllEntries"
          @start-build="onStartBuild"
        />
      </div>

      <!-- Confirmation Dialogs -->
      <ConfirmDialog group="build-history" />

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
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted, watch, inject } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useBuildHistory } from "../store/build-history";
import type { BuildHistoryEntry } from "@pipelab/shared";

// Components
import BuildHistoryList from "./BuildHistoryList.vue";

import { useAuth } from "../store/auth";
import { OpenUpgradeDialogKey } from "../utils/injection-keys";

// Props
interface Props {
  visible: boolean;
  pipelineId?: string;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  hide: [];
  "update:visible": [value: boolean];
}>();

// Composables
const confirm = useConfirm();

// Stores
const buildHistoryStore = useBuildHistory();
const authStore = useAuth();
const openUpgradeDialog = inject(OpenUpgradeDialogKey) as () => void;

// Local state
const showExportDialog = ref(false);
const exportProgress = ref(0);
const exportStatus = ref("");

const totalCount = computed(() => buildHistoryStore.storageInfo?.totalEntries || 0);

// Methods



const onDeleteEntry = async (entry: BuildHistoryEntry) => {
  confirm.require({
    group: "build-history",
    message: `Are you sure you want to delete the build history entry for "${entry.projectName}"?`,
    header: "Delete Build History Entry",
    icon: "pi pi-exclamation-triangle",
    accept: async () => {
      try {
        await buildHistoryStore.deleteEntry(entry.id);
      } catch (error) {
        console.error("Failed to delete entry:", error);
      }
    },
  });
};

const onClearAllEntries = async () => {
  const message = props.pipelineId
    ? `Are you sure you want to clear ALL build history entries for this pipeline?`
    : `Are you sure you want to clear ALL build history entries across all pipelines?`;

  confirm.require({
    group: "build-history",
    message,
    header: "Clear Build History",
    icon: "pi pi-exclamation-triangle",
    accept: async () => {
      try {
        if (props.pipelineId) {
          await buildHistoryStore.clearHistoryByPipeline(props.pipelineId);
        } else {
          await buildHistoryStore.clearHistory();
        }
      } catch (error) {
        console.error("Failed to clear entries:", error);
      }
    },
  });
};



const onStartBuild = () => {
  // Close the dialog
  emit("update:visible", false);
  // Navigate to the appropriate build/start page
  // router.push('/scenarios')
};

// Helper function to load build history
const loadBuildHistory = async (): Promise<void> => {
  try {
    // Build query with current pipelineId
    const query = {
      pipelineId: props.pipelineId || undefined,
    };
    console.log("query", query);
    await buildHistoryStore.loadEntries(query);
  } catch (error) {
    console.error("Failed to load build history after auth change:", error);
  }
};

watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      loadBuildHistory();
    }
  },
);

watch(
  () => props.pipelineId,
  () => {
    if (props.visible) {
      loadBuildHistory();
    }
  },
);

authStore.onSubscriptionChanged(async ({ subscriptions }) => {
  // If user now has build history benefit, load entries
  if (props.visible) {
    loadBuildHistory();
  }
});

onMounted(() => {
  if (props.visible) {
    loadBuildHistory();
  }
});


</script>

<style scoped>
.build-history-dialog {
  padding: 1rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.loading-state {
  text-align: center;
  padding: 2rem;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
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

.unauthorized-banner {
  border: 1px solid var(--primary-color);
  background-color: var(--primary-50);
}

.unauthorized-banner p {
  font-size: 0.9rem;
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
  .build-history-dialog {
    padding: 0.5rem;
  }

  .unauthorized-actions {
    flex-direction: column;
    align-items: center;
  }
}
</style>
