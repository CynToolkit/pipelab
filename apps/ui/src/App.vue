<template>
  <div class="app">
    <transition name="fade" mode="out-in">
      <ConnectingPage v-if="isConnecting" />
      <DisconnectedPage v-else-if="isDisconnected" />
      <div v-else class="layout">
        <div class="container">
          <div class="content">
            <div class="main">
              <section v-if="initialDataFailure" class="initial-data-error" role="alert">
                <h1>Unable to load Pipelab data</h1>
                <p>{{ initialDataFailureLabel }}</p>
                <p>{{ initialDataFailure.message }}</p>
                <Button
                  label="Try again"
                  icon="pi pi-refresh"
                  :loading="isLoading"
                  @click="fetchInitialData"
                />
              </section>
              <router-view v-else-if="isDataLoaded"></router-view>
              <div v-else>
                <SubscriptionLoadingIndicator v-if="isLoading || !isDataLoaded" />
              </div>
            </div>
          </div>

          <Dialog
            v-model:visible="isUpgradeDialogVisible"
            modal
            :style="{ width: '50vw' }"
            :breakpoints="{ '575px': '90vw' }"
          >
            <UpgradeDialog @close="closeUpgradeDialog" />
          </Dialog>
        </div>
      </div>
    </transition>
    <DevBenefitsOverride v-if="!isDisconnected" />
    <WebFilePicker v-if="!isDisconnected" />
    <MigrationModal
      v-if="isMigrationModalVisible"
      v-model:visible="isMigrationModalVisible"
      :source-channel="migrationSourceChannel"
    />
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from "./store/app";
import { onMounted, ref, provide, watch, computed } from "vue";
import { useFiles } from "./store/files";
import { handle } from "./composables/handlers";
import { useLogger, MigrationChannel } from "@pipelab/shared";
import { useAuth } from "@renderer/store/auth";
import { storeToRefs } from "pinia";
import { useAppSettings } from "./store/settings";
import { useConnectionsStore } from "./store/connections";
import SubscriptionLoadingIndicator from "./components/SubscriptionLoadingIndicator.vue";
import DisconnectedPage from "./components/DisconnectedPage.vue";
import ConnectingPage from "./components/ConnectingPage.vue";
import UpgradeDialog from "./components/UpgradeDialog.vue";
import DevBenefitsOverride from "./components/DevBenefitsOverride.vue";
import WebFilePicker from "./components/WebFilePicker.vue";
import Dialog from "primevue/dialog";
import Toast from "primevue/toast";
import MigrationModal from "./components/MigrationModal.vue";
import { useAPI } from "./composables/api";
import { OpenMigrationModalKey, OpenUpgradeDialogKey } from "./utils/injection-keys";
import { websocketManager } from "./composables/websocket-manager";
import { useWebSocketAPI } from "./composables/websocket-client";
import Button from "primevue/button";
import { loadInitialData, type InitialDataFailureKind } from "./initial-data-state";

const appStore = useAppStore();
const filesStore = useFiles();
const settingsStore = useAppSettings();
const connectionsStore = useConnectionsStore();
const { logger } = useLogger();
const authStore = useAuth();
const { init: authInit, fetchSubscription } = authStore;
const { isLoadingSubscriptions } = storeToRefs(authStore);
const { settings } = storeToRefs(settingsStore);
const { init: initSettings } = settingsStore;

const { init } = appStore;
const { on } = useWebSocketAPI();
const isLoading = ref(false);
const isDataLoaded = ref(false);
const initialDataFailure = ref<{ kind: InitialDataFailureKind; message: string }>();
const isInitialized = ref(false);
const isServerReady = ref(false);
const isUpgradeDialogVisible = ref(false);
const minimumLoadingTimeReached = ref(false);

const isMigrationModalVisible = ref(false);
const migrationSourceChannel = ref<MigrationChannel | undefined>(undefined);
const openMigrationModal = (sourceChannel?: MigrationChannel) => {
  migrationSourceChannel.value = sourceChannel;
  isMigrationModalVisible.value = true;
};
provide(OpenMigrationModalKey, openMigrationModal);

const isDisconnected = computed(
  () =>
    isInitialized.value &&
    minimumLoadingTimeReached.value &&
    (websocketManager.connectionState.value === "disconnected" ||
      websocketManager.connectionState.value === "error"),
);

const isConnecting = computed(
  () =>
    !isInitialized.value ||
    !minimumLoadingTimeReached.value ||
    websocketManager.connectionState.value === "connecting" ||
    !isServerReady.value,
);

const initialDataFailureLabel = computed(() => {
  switch (initialDataFailure.value?.kind) {
    case "backend-disconnected":
      return "The Pipelab backend disconnected while loading required data.";
    case "project-config":
      return "Projects or application configuration could not be loaded.";
    case "connections":
      return "Saved connections could not be loaded.";
    default:
      return "Required startup data could not be loaded.";
  }
});

const openUpgradeDialog = () => {
  isUpgradeDialogVisible.value = true;
};

const closeUpgradeDialog = () => {
  isUpgradeDialogVisible.value = false;
};

provide(OpenUpgradeDialogKey, openUpgradeDialog);

handle("log:message", async (event, { value, send }) => {
  console.log("value", value);
  // console.log('log:message: Received value:', {
  //   value,
  //   type: typeof value,
  //   hasValue: !!value,
  //   isObject: typeof value === 'object',
  //   hasMeta: value?._meta,
  //   metaType: typeof value?._meta
  // })

  // Validate that value exists and is an object before accessing properties
  if (!value || typeof value !== "object") {
    console.warn("log:message: Invalid value received:", {
      value,
      type: typeof value,
      hasValue: !!value,
    });
    send({
      type: "end",
      data: {
        type: "success",
        result: undefined,
      },
    });
    return;
  }

  // Check if the value has _meta property before accessing it
  if (
    value &&
    value._meta &&
    typeof value._meta === "object" &&
    value._meta.logLevelId !== undefined
  ) {
    try {
      const values = Object.entries(value)
        .filter(([key]) => key !== "_meta")
        .map(([, v]) => v);

      // Filter out undefined values to prevent tslog errors
      const filteredValues = values.filter((v) => v !== undefined);
      const logLevelName = value._meta.logLevelName || "LOG";

      logger()
        .getSubLogger({
          name: "Main",
        })
        .log(
          value._meta.logLevelId,
          value._meta.path?.fullFilePath || "unknown",
          ...[logLevelName, ...filteredValues],
        );
    } catch (error) {
      console.error("log:message: Error processing log message:", error);
    }
  } else {
    console.warn("log:message: Value missing _meta property or _meta is not an object:", {
      hasMeta: !!value._meta,
      metaType: typeof value._meta,
      valueKeys: Object.keys(value || {}),
    });
  }

  send({
    type: "end",
    data: {
      type: "success",
      result: undefined,
    },
  });
});

let initialDataPromise: Promise<void> | undefined;
const fetchInitialData = () => {
  if (initialDataPromise) return initialDataPromise;
  console.log("[App] fetchInitialData: Starting remote data fetch");
  isLoading.value = true;
  isDataLoaded.value = false;
  initialDataFailure.value = undefined;
  initialDataPromise = (async () => {
    const result = await loadInitialData(
      [
        { section: "projects", load: () => filesStore.load() },
        { section: "plugins", load: () => init() },
        { section: "settings", load: () => settingsStore.load() },
        { section: "connections", load: () => connectionsStore.load() },
        { section: "auth", load: () => authInit() },
        { section: "subscription", load: () => fetchSubscription() },
      ],
      () => websocketManager.connectionState.value === "connected",
    );
    if (result.type === "error") {
      initialDataFailure.value = result.failure;
      logger().error("Failed to fetch initial data:", result.failure);
      return;
    }
    isDataLoaded.value = true;
    logger().info("Initial data fetch complete");
  })().finally(() => {
    isLoading.value = false;
    initialDataPromise = undefined;
  });
  return initialDataPromise;
};

// Watch for WebSocket connection and server readiness to trigger data fetch
watch(
  [() => websocketManager.connectionState.value, isServerReady],
  ([state, ready]) => {
    if (state === "connected" && ready) {
      fetchInitialData();
    }
  },
  { immediate: true },
);

// Apply app theme configuration
watch(
  () => settingsStore.settings?.theme,
  (newTheme) => {
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  },
  { immediate: true },
);

// Connection failure is handled by showing the DisconnectedPage in the template

onMounted(async () => {
  console.log("[App] onMounted: UI mounted, connecting to agent");

  on("startup:progress", (event) => {
    if (event.type === "done") {
      console.log(`[App] Startup event received: ${event.type}`);
      isServerReady.value = true;
    }
  });

  // Connect to the WebSocket server directly
  await websocketManager.connect();
  isInitialized.value = true;

  // Ensure the connecting page is visible for at least a certain amount of time
  setTimeout(() => {
    minimumLoadingTimeReached.value = true;
  }, 2000);

  // Loading state for specific data should be handled by components
});
</script>

<style lang="scss">
.app,
.layout {
  height: 100%;
  overflow: hidden;
}

.content {
  display: flex;
  position: relative;
  flex: 1;
  min-height: 0;

  .main {
    flex: 1;
    display: flex;
    width: 100%;
    height: 100%;
  }
}

.initial-data-error {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 2rem;
  text-align: center;
}

.container {
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
