<template>
  <Dialog
    :visible="visible"
    modal
    :closable="!loading"
    :style="{ width: '600px', maxWidth: '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="migration-header">
        <i class="mdi mdi-auto-fix title-icon"></i>
        <div>
          <h3>Import Data from {{ report?.sourceChannel || "Pipelab" }}</h3>
          <p class="description">
            Select the pipelines and settings you want to import into your current workspace.
          </p>
        </div>
      </div>
    </template>

    <div class="migration-content">
      <div
        v-if="scanning"
        class="flex flex-column align-items-center justify-content-center py-6 gap-3"
      >
        <i class="pi pi-spin pi-spinner text-4xl text-primary"></i>
        <span>Scanning other channel configuration...</span>
      </div>

      <div v-else-if="scanError" class="error-container py-4">
        <Message severity="error" :closable="false">{{ scanError }}</Message>
      </div>

      <div v-else class="migration-form">
        <!-- Warning message about overwriting -->
        <div class="mb-4">
          <Message severity="warn" :closable="false">
            ⚠️ Importing items that already exist will overwrite their current version. A backup of
            your current config will be saved automatically before importing.
          </Message>
        </div>

        <div class="sections-list flex flex-column gap-3">
          <!-- Section 1: Settings -->
          <div v-if="report && report.settingsExists" class="migration-card">
            <div class="flex align-items-start gap-3">
              <Checkbox
                v-model="migrateSettings"
                binary
                input-id="settings-cb"
                :disabled="!report.settingsImportable"
              />
              <div class="flex-1">
                <label for="settings-cb" class="item-title flex align-items-center gap-2">
                  Preferences & Settings
                  <span v-if="!report.settingsImportable" class="error-badge small text-xs"
                    >⚠️ Newer version (cannot import)</span
                  >
                  <span v-else class="warning-badge">⚠️ Overwrites Current</span>
                </label>
                <p class="item-desc">Clones your theme, language, and other preferences.</p>

                <!-- Comparison Meta -->
                <div class="meta-comparison flex flex-column gap-1 mt-2 p-2 border-round text-xs">
                  <div class="flex justify-content-between">
                    <span class="text-muted">{{ report.sourceChannel }} (Source):</span>
                    <span class="font-medium"
                      >{{ report.settingsVersion || "N/A" }} ({{
                        formatTime(report.settingsMtimeSource)
                      }})</span
                    >
                  </div>
                  <div class="flex justify-content-between">
                    <span class="text-muted">{{ report.targetChannel }} (Current):</span>
                    <span class="font-medium"
                      >{{ report.settingsVersionTarget || "N/A" }} ({{
                        formatTime(report.settingsMtimeTarget)
                      }})</span
                    >
                  </div>
                  <div
                    v-if="
                      report.settingsMtimeSource > report.settingsMtimeTarget &&
                      report.settingsImportable
                    "
                    class="text-right text-success font-semibold mt-1"
                  >
                    ✨ Source is newer
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 2: Connections -->
          <div v-if="report && report.connectionsExists" class="migration-card">
            <div class="flex align-items-start gap-3">
              <Checkbox
                v-model="migrateConnections"
                binary
                input-id="connections-cb"
                :disabled="!report.connectionsImportable"
              />
              <div class="flex-1">
                <label for="connections-cb" class="item-title flex align-items-center gap-2">
                  Connections & Credentials ({{ report.connectionsCount }}
                  found)
                  <span v-if="!report.connectionsImportable" class="error-badge small text-xs"
                    >⚠️ Newer version (cannot import)</span
                  >
                  <span v-else class="warning-badge">⚠️ Overwrites Current</span>
                </label>
                <p class="item-desc">
                  Clones your integrations credentials (e.g. GitHub, itch.io, Steam).
                </p>

                <!-- Comparison Meta -->
                <div class="meta-comparison flex flex-column gap-1 mt-2 p-2 border-round text-xs">
                  <div class="flex justify-content-between">
                    <span class="text-muted">{{ report.sourceChannel }} (Source):</span>
                    <span class="font-medium"
                      >{{ report.connectionsVersion || "N/A" }} ({{
                        formatTime(report.connectionsMtimeSource)
                      }})</span
                    >
                  </div>
                  <div class="flex justify-content-between">
                    <span class="text-muted">{{ report.targetChannel }} (Current):</span>
                    <span class="font-medium"
                      >{{ report.connectionsVersionTarget || "N/A" }} ({{
                        formatTime(report.connectionsMtimeTarget)
                      }})</span
                    >
                  </div>
                  <div
                    v-if="
                      report.connectionsMtimeSource > report.connectionsMtimeTarget &&
                      report.connectionsImportable
                    "
                    class="text-right text-success font-semibold mt-1"
                  >
                    ✨ Source is newer
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 3: Projects & Pipelines -->
          <div v-if="report && report.projects.length > 0" class="projects-section">
            <div class="flex align-items-center justify-content-between mb-2">
              <h4 class="section-title mb-0">Projects & Pipelines</h4>
              <span v-if="!report.projectsImportable" class="error-badge small text-xs"
                >⚠️ Projects version newer (cannot import)</span
              >
            </div>

            <!-- Comparison Meta -->
            <div class="meta-comparison flex flex-column gap-1 mb-3 p-2 border-round text-xs">
              <div class="flex justify-content-between">
                <span class="text-muted">{{ report.sourceChannel }} (Source):</span>
                <span class="font-medium"
                  >{{ report.projectsVersion || "N/A" }} ({{
                    formatTime(report.projectsMtimeSource)
                  }})</span
                >
              </div>
              <div class="flex justify-content-between">
                <span class="text-muted">{{ report.targetChannel }} (Current):</span>
                <span class="font-medium"
                  >{{ report.projectsVersionTarget || "N/A" }} ({{
                    formatTime(report.projectsMtimeTarget)
                  }})</span
                >
              </div>
              <div
                v-if="
                  report.projectsMtimeSource > report.projectsMtimeTarget &&
                  report.projectsImportable
                "
                class="text-right text-success font-semibold mt-1"
              >
                ✨ Source is newer
              </div>
            </div>

            <div class="flex flex-column gap-3">
              <div v-for="proj in report.projects" :key="proj.id" class="project-card">
                <div class="project-header flex align-items-center gap-3 py-2 px-3">
                  <Checkbox
                    :model-value="selectedProjects.includes(proj.id)"
                    binary
                    :disabled="!report.projectsImportable"
                    @update:model-value="toggleProject(proj, $event)"
                  />
                  <div class="flex-1">
                    <span class="font-bold flex align-items-center gap-2">
                      📁 Project: {{ proj.name }}
                      <span v-if="projectOverwrites(proj)" class="warning-badge small"
                        >⚠️ Overwrites Existing</span
                      >
                    </span>
                    <p v-if="proj.description" class="text-xs text-muted mb-0">
                      {{ proj.description }}
                    </p>
                  </div>
                </div>

                <!-- Pipelines inside project -->
                <div class="pipelines-list flex flex-column pl-5 pr-3 py-2 border-top">
                  <div
                    v-for="pipe in proj.pipelines"
                    :key="pipe.id"
                    class="pipeline-item flex align-items-start gap-3 py-2"
                  >
                    <Checkbox
                      :model-value="selectedPipelines.includes(pipe.id)"
                      binary
                      :disabled="!report.projectsImportable"
                      @update:model-value="togglePipeline(proj, pipe, $event)"
                    />
                    <div class="flex-1 flex flex-column">
                      <span class="pipeline-name flex align-items-center gap-2">
                        ⚡ {{ pipe.name }}
                        <span v-if="pipe.existsInBeta" class="warning-badge small text-xs"
                          >⚠️ Overwrites Current</span
                        >
                        <span v-else class="new-badge small text-xs">New</span>
                      </span>
                      <p v-if="pipe.description" class="text-xs text-muted mb-1">
                        {{ pipe.description }}
                      </p>

                      <!-- Timestamps -->
                      <div class="timestamp-comparison flex align-items-center gap-2 text-xs">
                        <span
                          >{{ report.sourceChannel }}:
                          <span class="time-val">{{
                            formatTime(pipe.lastModifiedStable)
                          }}</span></span
                        >
                        <span v-if="pipe.existsInBeta" class="separator">|</span>
                        <span v-if="pipe.existsInBeta"
                          >{{ report.targetChannel }}:
                          <span class="time-val">{{
                            formatTime(pipe.lastModifiedBeta)
                          }}</span></span
                        >
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="proj.pipelines.length === 0"
                    class="py-2 text-xs text-center text-muted"
                  >
                    No pipelines in this project
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-content-between w-full align-items-center border-top pt-3">
        <div></div>
        <div class="flex gap-2">
          <Button
            label="Cancel"
            text
            severity="secondary"
            :disabled="loading"
            @click="emit('update:visible', false)"
          />
          <Button
            :label="loading ? 'Importing...' : 'Import Selected'"
            icon="pi pi-check"
            :disabled="!hasSelection || loading || scanning"
            :loading="loading"
            @click="performMigration"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import Dialog from "primevue/dialog";
import Checkbox from "primevue/checkbox";
import Button from "primevue/button";
import Message from "primevue/message";
import { useAPI } from "@renderer/composables/api";
import { useAppSettings } from "@renderer/store/settings";
import { useConnectionsStore } from "@renderer/store/connections";
import { useFiles } from "@renderer/store/files";
import { useToast } from "primevue/usetoast";
import { StableDataReport, MigrationOptions, MigrationChannel } from "@pipelab/shared";

const props = defineProps<{
  visible: boolean;
  sourceChannel?: MigrationChannel;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
}>();

const api = useAPI();
const toast = useToast();
const settingsStore = useAppSettings();
const connectionsStore = useConnectionsStore();
const filesStore = useFiles();

const scanning = ref(true);
const scanError = ref<string | null>(null);
const report = ref<StableDataReport | null>(null);

const migrateSettings = ref(false);
const migrateConnections = ref(false);
const selectedProjects = ref<string[]>([]);
const selectedPipelines = ref<string[]>([]);
const loading = ref(false);

const hasSelection = computed(() => {
  return (
    migrateSettings.value ||
    migrateConnections.value ||
    selectedProjects.value.length > 0 ||
    selectedPipelines.value.length > 0
  );
});

const loadReport = async () => {
  scanning.value = true;
  scanError.value = null;
  try {
    const res = await api.execute("migration:scan-stable", { sourceChannel: props.sourceChannel });
    if (res.type === "success") {
      report.value = res.result;
    } else {
      scanError.value = res.ipcError;
    }
  } catch (err) {
    scanError.value = err instanceof Error ? err.message : "Failed to scan database";
  } finally {
    scanning.value = false;
  }
};

onMounted(() => {
  loadReport();
});

const projectOverwrites = (proj: any) => {
  return proj.pipelines.some((p: any) => p.existsInBeta);
};

const formatTime = (isoString?: string | number) => {
  if (!isoString) return "N/A";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString.toString();
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString.toString();
  }
};

const toggleProject = (proj: any, checked: boolean) => {
  if (checked) {
    if (!selectedProjects.value.includes(proj.id)) {
      selectedProjects.value.push(proj.id);
    }
    proj.pipelines.forEach((p: any) => {
      if (!selectedPipelines.value.includes(p.id)) {
        selectedPipelines.value.push(p.id);
      }
    });
  } else {
    selectedProjects.value = selectedProjects.value.filter((id) => id !== proj.id);
    const pipeIds = proj.pipelines.map((p: any) => p.id);
    selectedPipelines.value = selectedPipelines.value.filter((id) => !pipeIds.includes(id));
  }
};

const togglePipeline = (proj: any, pipe: any, checked: boolean) => {
  if (checked) {
    if (!selectedPipelines.value.includes(pipe.id)) {
      selectedPipelines.value.push(pipe.id);
    }
    if (!selectedProjects.value.includes(proj.id)) {
      selectedProjects.value.push(proj.id);
    }
  } else {
    selectedPipelines.value = selectedPipelines.value.filter((id) => id !== pipe.id);
    const hasAnyChecked = proj.pipelines.some((p: any) => selectedPipelines.value.includes(p.id));
    if (!hasAnyChecked) {
      selectedProjects.value = selectedProjects.value.filter((id) => id !== proj.id);
    }
  }
};

const performMigration = async () => {
  loading.value = true;
  try {
    const options: MigrationOptions = {
      migrateSettings: migrateSettings.value,
      migrateConnections: migrateConnections.value,
      selectedProjects: selectedProjects.value,
      selectedPipelines: selectedPipelines.value,
      sourceChannel: props.sourceChannel,
    };

    const res = await api.execute("migration:perform", options);
    if (res.type === "success") {
      toast.add({
        severity: "success",
        summary: "Migration Successful",
        detail: "Selected configurations and pipelines have been imported.",
        life: 4000,
      });

      // Reload UI stores
      await settingsStore.load(true);
      await connectionsStore.load(true);
      await filesStore.load(true);

      emit("update:visible", false);
    } else {
      toast.add({
        severity: "error",
        summary: "Migration Failed",
        detail: res.ipcError,
        life: 5000,
      });
    }
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: err instanceof Error ? err.message : "Failed to migrate data",
      life: 5000,
    });
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped lang="scss">
.migration-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;

  .title-icon {
    font-size: 1.8rem;
    color: var(--p-primary-color, #0ea5e9);
    margin-top: 2px;
  }

  h3 {
    margin: 0 0 4px 0;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--p-text-muted-color, #64748b);
  }
}

.migration-content {
  max-height: 50vh;
  overflow-y: auto;
  padding: 10px 0;
}

.migration-card {
  background: var(--surface-card, var(--p-surface-800, #ffffff));
  border: 1px solid var(--p-surface-border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  :root.dark & {
    background: var(--surface-card, var(--p-surface-800, #1e1e1e));
    border-color: var(--surface-border, var(--p-surface-700, #333333));
  }

  .item-title {
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    user-select: none;
  }

  .item-desc {
    margin: 4px 0 0 0;
    font-size: 0.8rem;
    color: var(--p-text-muted-color, #64748b);
  }
}

.warning-badge {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.75rem;

  &.small {
    padding: 1px 4px;
    font-size: 0.7rem;
  }
}

.error-badge {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.75rem;

  &.small {
    padding: 1px 4px;
    font-size: 0.7rem;
  }
}

.new-badge {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.7rem;
}

.meta-comparison {
  background: var(--p-surface-50, #f8fafc);
  padding: 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  border: 1px solid var(--p-surface-border, #e2e8f0);
  color: var(--p-text-color, #334155);

  :root.dark & {
    background: var(--p-surface-900, #1e293b);
    border-color: var(--p-surface-800, #334155);
    color: var(--p-text-muted-color, #94a3b8);
  }
}

.projects-section {
  .section-title {
    font-weight: 700;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--p-text-muted-color, #64748b);
  }
}

.project-card {
  border: 1px solid var(--surface-border, var(--p-surface-border, #e2e8f0));
  border-radius: 8px;
  background: var(--surface-ground, var(--p-surface-ground, #f8fafc));
  overflow: hidden;

  :root.dark & {
    background: var(--surface-ground, var(--p-surface-900, #121212));
    border-color: var(--surface-border, var(--p-surface-700, #333333));
  }

  .project-header {
    background: var(--surface-card, var(--p-surface-card, #ffffff));

    :root.dark & {
      background: var(--surface-card, var(--p-surface-800, #1e1e1e));
    }
  }

  .pipelines-list {
    background: var(--surface-ground, var(--p-surface-ground, #f8fafc));

    :root.dark & {
      background: var(--surface-ground, var(--p-surface-900, #121212));
    }

    .pipeline-item {
      &:not(:last-child) {
        border-bottom: 1px dashed var(--p-surface-border, #e2e8f0);
      }
    }

    .pipeline-name {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .timestamp-comparison {
      color: var(--p-text-muted-color, #64748b);

      .time-val {
        font-weight: 500;
        color: var(--p-text-color, #334155);
      }

      .separator {
        opacity: 0.4;
      }
    }
  }
}

.border-top {
  border-top: 1px solid var(--p-surface-border, #e2e8f0);
}
</style>
