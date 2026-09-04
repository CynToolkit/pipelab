<template>
  <div class="paths-page">
    <Layout>
      <div class="paths-content">

        <!-- Header strip -->
        <div class="paths-header">
          <span class="project-name">{{ projectName }}</span>
          <SourceCard
            :source="path.source"
            :last-export="lastExport"
            :source-warning="sourceWarning"
            @edit="editingSource = true"
          />
          <button class="advanced-link" @click="goAdvanced">Advanced</button>
        </div>

        <!-- Destinations -->
        <div class="destinations-list">
          <DestinationRow
            v-for="(dest, index) in path.destinations"
            :key="index"
            :destination="dest"
            :state="runState.destinations[index]"
            :credential-saving="savingCredential === index"
            @update-delivery="(d) => updateDelivery(index, d)"
            @remove="removeDestination(index)"
            @ship="ship(index)"
            @retry="retry(index)"
            @skip="skip(index)"
            @save-credential="(cred) => saveCredential(index, cred)"
          />

          <!-- Empty state -->
          <div v-if="path.destinations.length === 0" class="empty-destinations">
            <i class="mdi mdi-package-variant-closed empty-icon"></i>
            <p class="empty-heading">No destinations yet</p>
            <p class="empty-sub">Add where you want your game to go.</p>
          </div>
        </div>

        <!-- Add destination -->
        <button class="add-destination-btn" @click="showAddDestination = true">
          <i class="mdi mdi-plus"></i>
          Add destination
        </button>

        <!-- Ship all -->
        <button
          class="ship-all-btn"
          :disabled="readyCount === 0 || isAnyShipping"
          @click="shipAll"
        >
          {{ shipAllLabel }}
        </button>
      </div>
    </Layout>

    <!-- Source edit panel -->
    <SourceEditPanel
      v-if="editingSource"
      :source="path.source"
      @save="saveSource"
      @close="editingSource = false"
    />

    <!-- Add destination picker -->
    <AddDestinationSheet
      v-if="showAddDestination"
      :used-types="path.destinations.map((d) => d.type)"
      @pick="addDestination"
      @close="showAddDestination = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import Layout from "@renderer/components/Layout.vue";
import SourceCard from "@renderer/components/paths/SourceCard.vue";
import SourceEditPanel from "@renderer/components/paths/SourceEditPanel.vue";
import DestinationRow from "@renderer/components/paths/DestinationRow.vue";
import AddDestinationSheet from "@renderer/components/paths/AddDestinationSheet.vue";
import type {
  Path,
  Source,
  Destination,
  DeliveryKind,
  PathRunState,
} from "@pipelab/shared";

// ─── Project / Path ─────────────────────────────────────────────────────────

const projectName = ref("My Game");
const lastExport = ref<Date | null>(null);
const sourceWarning = ref(false);
const editingSource = ref(false);
const showAddDestination = ref(false);
const savingCredential = ref<number | null>(null);

// ─── Path state ─────────────────────────────────────────────────────────────

const path = ref<Path>({
  version: "1.0.0",
  source: { type: "construct3", path: "" },
  destinations: [],
});

const runState = ref<PathRunState>({
  destinations: {},
});

// ─── Derived ─────────────────────────────────────────────────────────────────

const readyCount = computed(
  () =>
    path.value.destinations.filter((d, i) => {
      const s = runState.value.destinations[i];
      return s?.state === "ready";
    }).length,
);

const isAnyShipping = computed(
  () => Object.values(runState.value.destinations).some((s) => s?.state === "shipping"),
);

const shipAllLabel = computed(() => {
  const n = readyCount.value;
  if (n === 0) return "Ship all ready";
  if (isAnyShipping.value) return `Shipping ${n}…`;
  if (n === 1) return "Ship all ready";
  return `Ship ${n} ready`;
});

// ─── Source ─────────────────────────────────────────────────────────────────

const saveSource = (source: Source) => {
  path.value.source = source;
  sourceWarning.value = false;
  editingSource.value = false;
};

// ─── Destinations ───────────────────────────────────────────────────────────

const addDestination = (type: Destination["type"]) => {
  const newDest = createDestination(type);
  path.value.destinations.push(newDest);
  runState.value.destinations[path.value.destinations.length - 1] = {
    state: "ready",
  };
  showAddDestination.value = false;
};

const createDestination = (type: Destination["type"]): Destination => {
  switch (type) {
    case "steam":
      return { type: "steam", delivery: "app", appId: "", credentialId: "" };
    case "itch":
      return { type: "itch", delivery: "archive", project: "", credentialId: "" };
    case "poki":
      return { type: "poki", delivery: "web", gameId: "", credentialId: "" };
    case "discord-activity":
      return { type: "discord-activity", delivery: "app", appId: "", credentialId: "" };
    case "netlify":
      return { type: "netlify", delivery: "web", site: "", credentialId: "" };
    case "web":
      return { type: "web", delivery: "web", outputDir: "" };
    case "folder":
      return { type: "folder", delivery: "archive", outputDir: "" };
  }
};

const removeDestination = (index: number) => {
  path.value.destinations.splice(index, 1);
  delete runState.value.destinations[index];
};

const updateDelivery = (index: number, delivery: DeliveryKind) => {
  const dest = path.value.destinations[index];
  if (dest) {
    (dest as any).delivery = delivery;
  }
};

const saveCredential = async (index: number, credentialId: string) => {
  savingCredential.value = index;
  await new Promise((r) => setTimeout(r, 600)); // mock async
  const dest = path.value.destinations[index] as any;
  if (dest) dest.credentialId = credentialId;
  savingCredential.value = null;
};

// ─── Run ────────────────────────────────────────────────────────────────────

const ship = (index: number) => {
  runState.value.destinations[index] = {
    state: "shipping",
    startedAt: Date.now(),
  };
  // Mock run: succeed after 2s
  setTimeout(() => {
    runState.value.destinations[index] = {
      state: "shipped",
      startedAt: Date.now() - 2000,
      finishedAt: Date.now(),
      lastLog: "Upload complete.",
    };
  }, 2000);
};

const shipAll = () => {
  path.value.destinations.forEach((_, i) => {
    if (runState.value.destinations[i]?.state === "ready") {
      ship(i);
    }
  });
};

const retry = (index: number) => {
  runState.value.destinations[index] = { state: "ready" };
  ship(index);
};

const skip = (index: number) => {
  runState.value.destinations[index] = {
    state: "skipped",
    finishedAt: Date.now(),
  };
};

// ─── Navigation ─────────────────────────────────────────────────────────────

const router = useRouter();
const goAdvanced = () => {
  router.push("/scenarios/editor/new");
};
</script>

<style scoped>
.paths-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.paths-content {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  padding: 0 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ─── Header ────────────────────────────────────────────────────────────── */

.paths-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  min-height: 56px;
  border-bottom: 1px solid #2a2a30;
  margin-bottom: 24px;
}

.project-name {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8b8b96;
  white-space: nowrap;
  flex-shrink: 0;
}

.advanced-link {
  margin-left: auto;
  font-size: 12px;
  color: #8b8b96;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.15s;
}

.advanced-link:hover {
  color: #e4e4e7;
}

/* ─── Destinations list ────────────────────────────────────────────────── */

.destinations-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

/* ─── Empty state ──────────────────────────────────────────────────────── */

.empty-destinations {
  text-align: center;
  padding: 48px 24px;
  color: #8b8b96;
}

.empty-icon {
  font-size: 32px;
  color: #3a3a42;
  display: block;
  margin-bottom: 12px;
}

.empty-heading {
  font-size: 16px;
  font-weight: 500;
  color: #e4e4e7;
  margin: 0 0 4px;
}

.empty-sub {
  font-size: 13px;
  color: #8b8b96;
  margin: 0;
}

/* ─── Add destination ───────────────────────────────────────────────────── */

.add-destination-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: none;
  border: none;
  color: #8b8b96;
  cursor: pointer;
  font-size: 13px;
  border-radius: 8px;
  width: 100%;
  margin-bottom: 16px;
  transition: background 0.15s, color 0.15s;
}

.add-destination-btn:hover {
  background: #1e1e24;
  color: #e4e4e7;
}

.add-destination-btn .mdi {
  font-size: 18px;
}

/* ─── Ship all ──────────────────────────────────────────────────────────── */

.ship-all-btn {
  width: 100%;
  height: 48px;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  color: #e4e4e7;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.ship-all-btn:not(:disabled):hover {
  background: #2a2a30;
}

.ship-all-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
