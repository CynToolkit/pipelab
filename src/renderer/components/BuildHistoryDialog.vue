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

      <!-- Main Content (only show if authorized) -->
      <div v-else-if="buildHistoryStore.canUseHistory" class="main-content">
        <!-- Build History List -->
        <BuildHistoryList
          :entries="buildHistoryStore.entries"
          :is-loading="buildHistoryStore.isLoading"
          :error="buildHistoryStore.error"
          :total-count="totalCount"
          :can-delete="true"
          :can-start-build="true"
          @view-details="onViewDetails"
          @delete="onDeleteEntry"
          @start-build="onStartBuild"
        />

      </div>

      <!-- Unauthorized State -->
      <div v-else class="unauthorized-state">
        <div class="unauthorized-icon">
          <i class="pi pi-lock"></i>
        </div>
        <h3>Premium Feature</h3>
        <p>Build history tracking is available with a premium subscription.</p>
        <div class="unauthorized-actions">
          <Button label="Upgrade to Access" severity="primary" @click="openUpgradeDialog" />
          <Button label="Close" severity="secondary" @click="$emit('update:visible', false)" />
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
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted, watch, inject } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useBuildHistory } from '../store/build-history'
import type { BuildHistoryEntry } from '@@/build-history'

// Components
import BuildHistoryList from './BuildHistoryList.vue'
import BuildDetailsModal from './BuildDetailsModal.vue'
import { useAuth } from '@renderer/store/auth'

// Props
interface Props {
  visible: boolean
  pipelineId?: string
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  hide: []
  'update:visible': [value: boolean]
}>()

// Composables
const confirm = useConfirm()

// Stores
const buildHistoryStore = useBuildHistory()
const authStore = useAuth()
const openUpgradeDialog = inject('openUpgradeDialog') as () => void

// Local state
const selectedEntry = ref<BuildHistoryEntry | null>(null)
const showDetailsModal = ref(false)
const showExportDialog = ref(false)
const exportProgress = ref(0)
const exportStatus = ref('')

const totalCount = computed(() => buildHistoryStore.storageInfo?.totalEntries || 0)

// Methods

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
  // Close the dialog
  emit('update:visible', false)
  // Navigate to the appropriate build/start page
  // router.push('/scenarios')
}


// Helper function to load build history
const loadBuildHistory = async (): Promise<void> => {
  console.log('buildHistoryStore.canUseHistory', buildHistoryStore.canUseHistory)
  if (buildHistoryStore.canUseHistory) {
    try {
      // Build query with current pipelineId
      const query = {
        pipelineId: props.pipelineId || undefined
      }
      console.log('query', query)
      await buildHistoryStore.loadEntries(query)
    } catch (error) {
      console.error('Failed to load build history after auth change:', error)
    }
  }
}

watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      loadBuildHistory()
    }
  }
)

watch(
  () => props.pipelineId,
  () => {
    if (props.visible) {
      loadBuildHistory()
    }
  }
)

authStore.onSubscriptionChanged(async ({ subscriptions }) => {
  console.log('subscriptions', subscriptions)
  console.log('authStore.hasBuildHistoryBenefit', authStore.hasBuildHistoryBenefit)
  // If user now has build history benefit, load entries
  if (props.visible) {
    loadBuildHistory()
  }
})

onMounted(() => {
  if (props.visible) {
    loadBuildHistory()
  }
})

// Cleanup - clear selection when component unmounts
onUnmounted(() => {
  selectedEntry.value = null
})
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
