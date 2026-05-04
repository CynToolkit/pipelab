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
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from "./store/app";
import { onMounted, ref, provide, watch, computed } from "vue";
import { primary, primaryDarken1, primaryDarken2 } from "./style/main";
import { useFiles } from "./store/files";
import { handle } from "./composables/handlers";
import { useLogger } from "@pipelab/shared";
import { useAuth } from "@renderer/store/auth";
import { storeToRefs } from "pinia";
import { useAppSettings } from "./store/settings";
import SubscriptionLoadingIndicator from "./components/SubscriptionLoadingIndicator.vue";
import DisconnectedPage from "./components/DisconnectedPage.vue";
import ConnectingPage from "./components/ConnectingPage.vue";
import UpgradeDialog from "./components/UpgradeDialog.vue";
import DevBenefitsOverride from "./components/DevBenefitsOverride.vue";
import WebFilePicker from "./components/WebFilePicker.vue";
import Dialog from "primevue/dialog";
import Toast from "primevue/toast";
import { websocketManager } from "./composables/websocket-manager";
import { useWebSocketAPI } from "./composables/websocket-client";

const appStore = useAppStore();
const filesStore = useFiles();
const settingsStore = useAppSettings();
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

const isDisconnected = computed(
  () =>
    isInitialized.value &&
    minimumLoadingTimeReached.value &&
    (websocketManager.connectionState.value === "disconnected" ||
      websocketManager.connectionState.value === "error"),
);

const isConnecting = computed(
  () =>
    isInitialized.value &&
    (!minimumLoadingTimeReached.value ||
      websocketManager.connectionState.value === "connecting" ||
      !isServerReady.value),
);

const openUpgradeDialog = () => {
  isUpgradeDialogVisible.value = true;
};

const closeUpgradeDialog = () => {
  isUpgradeDialogVisible.value = false;
};

provide("openUpgradeDialog", openUpgradeDialog);

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
      data: undefined,
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
          value._meta.path.fullFilePath,
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
    data: undefined,
  });
});

const fetchInitialData = async () => {
  console.log("[App] fetchInitialData: Starting remote data fetch");
  try {
    await filesStore.load();
    await init();
    // settingsStore.init() is no longer needed here as it's local, but we call loadRemoteSettings to sync
    await settingsStore.load();
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

onMounted(async () => {
  console.log("[App] onMounted: UI mounted, connecting to agent");

  on("startup:progress", (event) => {
    if (event.type === "ready") {
      console.log("[App] Startup ready signal received");
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
.layout,
.content {
  height: 100%;
  overflow: hidden;
}

.content {
  display: flex;

  .sidebar {
    display: flex;
    flex-direction: column;
    width: 300px;
    background-color: v-bind(primary);
    color: white;

    &.hidden {
      display: none;
    }

    .sidebar-title {
      font-size: 2rem;
      text-align: center;
      margin: 16px 12px;
      margin-bottom: 64px;
      margin-top: 32px;
    }

    .list {
      margin: 8px;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .list-item {
        cursor: pointer;
        padding: 8px 16px;
        font-size: 1.5rem;
        transition: background-color 0.25s;
        border-radius: 4px;
        color: white;
        text-decoration: none;

        .icon {
          margin-right: 8px;
        }

        &:hover {
          background-color: v-bind(primaryDarken1);
        }
      }
    }
  }

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

.router-link-active {
  background-color: v-bind(primaryDarken2);
}

.version {
  font-size: 1.2rem;
  margin: 16px;
  text-align: center;
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
