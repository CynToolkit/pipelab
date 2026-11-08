<template>
  <Dialog
    v-model:visible="visible"
    class="pl-dialog"
    modal
    header="New build"
    :style="{ width: '520px', maxWidth: '94vw' }"
  >
    <Message v-if="error" severity="error" role="alert">
      <div class="state-row">
        <span>{{ error }}</span>
        <Button label="Retry" text size="small" @click="probe" />
      </div>
    </Message>
    <p v-else-if="checking" class="state" role="status" aria-busy="true">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" /> Checking compatible builds…
    </p>
    <template v-else-if="candidates.length">
      <div class="filters">
        <div class="search-field">
          <i class="pi pi-search search-icon" aria-hidden="true" />
          <InputText
            ref="searchInput"
            v-model="filters.query"
            placeholder="Search builds"
            aria-label="Search builds"
            autocomplete="off"
            @keydown.enter.prevent="selectOnlyResult"
          />
        </div>
        <div v-if="engineOptions.length > 1" class="chips" role="group" aria-label="Engine">
          <button
            type="button"
            class="chip"
            :class="{ active: !filters.engine }"
            :aria-pressed="!filters.engine"
            @click="filters.engine = ''"
          >
            All engines
          </button>
          <button
            v-for="engine in engineOptions"
            :key="engine.id"
            type="button"
            class="chip"
            :class="{ active: filters.engine === engine.id }"
            :aria-pressed="filters.engine === engine.id"
            @click="filters.engine = engine.id"
          >
            {{ engine.label }}
          </button>
        </div>
        <div v-if="platformOptions.length > 1" class="chips" role="group" aria-label="Platform">
          <button
            type="button"
            class="chip"
            :class="{ active: !filters.platform }"
            :aria-pressed="!filters.platform"
            @click="filters.platform = ''"
          >
            All platforms
          </button>
          <button
            v-for="platform in platformOptions"
            :key="platform"
            type="button"
            class="chip"
            :class="{ active: filters.platform === platform }"
            :aria-pressed="filters.platform === platform"
            @click="filters.platform = platform"
          >
            <i :class="buildPlatformIcon(platform)" aria-hidden="true" />
            {{ buildPlatformLabel(platform) }}
          </button>
        </div>
      </div>
      <div v-if="groups.length" class="choice-groups">
        <section v-for="group in groups" :key="`${group.engine}`" class="group">
          <h3>
            {{ group.engineLabel }}<span class="group-count">{{ group.choices.length }}</span>
          </h3>
          <div class="choices">
            <button
              v-for="choice in group.choices"
              :key="`${choice.type}:${choice.engine}:${choice.target}`"
              type="button"
              class="choice"
              @click="select(choice)"
            >
              <i :class="buildPlatformIcon(buildChoicePlatform(choice))" aria-hidden="true" />
              <span class="choice-copy">
                <strong>{{ choice.targetLabel }}</strong>
                <small>{{ choice.typeLabel }}</small>
              </span>
              <span v-if="buildChoiceAlreadyAdded(flow, choice)" class="added">Already added</span>
              <i class="pi pi-plus add-icon" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
      <p v-else class="state" role="status">
        No builds match.
        <Button label="Clear filters" text size="small" @click="clearFilters" />
      </p>
    </template>
    <p v-else class="state" role="status">No compatible build is available for this deployment.</p>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRaw, watch } from "vue";
import type { ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";
import { useAPI } from "../composables/api";
import {
  probeCompatibleBuildCandidates,
  type CompatibleBuildCandidate,
} from "../pages/release-flow-model";
import {
  buildChoiceAlreadyAdded,
  buildChoicePlatform,
  buildPlatformIcon,
  buildPlatformLabel,
  filterBuildChoices,
  groupBuildChoices,
  type BuildChoiceFilters,
  type BuildPlatform,
} from "../utils/build-choices";

const props = defineProps<{
  visible: boolean;
  flow?: ReleaseConfig;
  catalog: ReleaseCatalog;
  destinationId?: string;
  slotId?: string;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  create: [choice: CompatibleBuildCandidate];
}>();

const api = useAPI();
const visible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});
const candidates = ref<CompatibleBuildCandidate[]>([]);
const searchInput = ref<{ $el?: HTMLElement } | null>(null);
const filters = reactive<BuildChoiceFilters>({ query: "", engine: "", platform: "" });
// Filter chips only exist when there is a real choice to make.
const engineOptions = computed(() => {
  const engines = new Map<string, string>();
  for (const choice of candidates.value) engines.set(choice.engine, choice.engineLabel);
  return [...engines].map(([id, label]) => ({ id, label }));
});
const platformOptions = computed(() => {
  const platforms = new Set<BuildPlatform>(candidates.value.map(buildChoicePlatform));
  return [...platforms];
});
const visibleChoices = computed(() => filterBuildChoices(candidates.value, filters));
const groups = computed(() => groupBuildChoices(visibleChoices.value));
const clearFilters = () => Object.assign(filters, { query: "", engine: "", platform: "" });
const checking = ref(false);
const error = ref("");
let latestRequest = 0;

// Only builds the planner accepts for this deployment are offered.
const probe = async () => {
  const requestId = ++latestRequest;
  candidates.value = [];
  error.value = "";
  clearFilters();
  if (!props.flow || !props.destinationId || !props.slotId) return;
  checking.value = true;
  try {
    const choices = await probeCompatibleBuildCandidates(
      structuredClone(toRaw(props.flow)),
      props.catalog,
      props.destinationId,
      props.slotId,
      async (candidateConfig) => {
        const result = await api.execute("release:plan", { config: candidateConfig });
        if (result.type === "error") throw new Error(result.ipcError);
        return result.result;
      },
      () => requestId === latestRequest,
    );
    if (requestId === latestRequest) {
      candidates.value = choices;
      // The dialog moves focus to its close button as it opens; take it back once it has settled.
      void nextTick(() => setTimeout(() => searchInput.value?.$el?.focus?.(), 120));
    }
  } catch (cause) {
    if (requestId === latestRequest)
      error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (requestId === latestRequest) checking.value = false;
  }
};
// Enter in the search box picks the build when exactly one remains.
const selectOnlyResult = () => {
  if (visibleChoices.value.length === 1) select(visibleChoices.value[0]!);
};
const select = (choice: CompatibleBuildCandidate) => {
  emit("create", choice);
  visible.value = false;
};

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) void probe();
    else latestRequest++;
  },
  { immediate: true },
);
</script>
<style scoped>
.filters {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}
.search-field {
  position: relative;
  width: 100%;
}
.search-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  color: var(--pl-muted);
  font-size: 0.9rem;
  pointer-events: none;
  transform: translateY(-50%);
}
.search-field :deep(.p-inputtext) {
  width: 100%;
  padding-left: 2.3rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--pl-border);
  border-radius: 999px;
  background: transparent;
  color: var(--pl-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 500;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    color 0.15s;
}
.chip:hover {
  border-color: var(--pl-border-strong);
  background: var(--pl-hover);
  color: var(--p-text-color);
}
.chip:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring);
}
.chip.active {
  border-color: var(--pl-accent);
  background: color-mix(in srgb, var(--pl-accent) 9%, transparent);
  color: var(--p-text-color);
  font-weight: 600;
}
.chip i {
  font-size: 0.9rem;
}
.choice-groups {
  display: grid;
  gap: 16px;
  max-height: 46vh;
  padding-right: 4px;
  overflow-y: auto;
}
.group h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  color: var(--pl-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.group-count {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--pl-hover);
  font-size: 0.68rem;
  letter-spacing: 0;
}
.choices {
  display: grid;
  gap: 6px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  background: var(--pl-card);
  color: var(--p-text-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease),
    box-shadow 0.15s var(--pl-ease);
}
.choice:hover {
  border-color: var(--pl-border-strong);
  background: var(--pl-sunken);
  box-shadow: var(--pl-shadow-xs);
}
.choice:focus-visible {
  outline: none;
  border-color: var(--pl-accent);
  box-shadow: var(--pl-ring);
}
.choice > i:first-child {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: 1px solid var(--pl-border);
  border-radius: 9px;
  background: var(--pl-card);
  color: var(--pl-muted);
  font-size: 1rem;
}
.choice-copy {
  display: grid;
  flex: 1;
  gap: 1px;
  min-width: 0;
}
.choice-copy strong {
  font-size: 0.86rem;
  font-weight: 600;
}
.choice-copy small {
  color: var(--pl-muted);
  font-size: 0.74rem;
}
.added {
  color: var(--pl-muted);
  font-size: 0.74rem;
}
.add-icon {
  color: var(--pl-muted);
  font-size: 0.85rem;
}
.state {
  margin: 0;
  padding: 24px 0;
  color: var(--pl-muted);
  font-size: 0.86rem;
  text-align: center;
}
.state-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
