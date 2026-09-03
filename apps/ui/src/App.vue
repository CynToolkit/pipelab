<template>
  <div class="app">
    <transition name="fade" mode="out-in">
      <ConnectingPage v-if="isConnecting" />
      <DisconnectedPage v-else-if="isDisconnected" />
      <div v-else class="layout">
        <div class="container">
          <div class="content">
            <div class="main">
              <router-view v-if="!isLoading"></router-view>
              <div v-else>
                <SubscriptionLoadingIndicator v-if="isLoading" />
                <Skeleton v-else width="100%" height="100%"></Skeleton>
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

const fetchInitialData = async () => {
  console.log("[App] fetchInitialData: Starting remote data fetch");
  try {
    await filesStore.load();
    await init();
    // settingsStore.init() is no longer needed here as it's local, but we call loadRemoteSettings to sync
    await settingsStore.load();
    await connectionsStore.load();

    await authInit();
    await fetchSubscription();
    isDataLoaded.value = true;
    logger().info("Remote data fetch complete");
  } catch (error) {
    logger().error("Failed to fetch remote data:", error);
  }
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
