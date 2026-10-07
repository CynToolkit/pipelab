<template>
  <div class="app">
    <router-view />
    <Dialog
      v-model:visible="isUpgradeDialogVisible"
      modal
      :style="{ width: '50vw' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <UpgradeDialog @close="closeUpgradeDialog" />
    </Dialog>
    <DevBenefitsOverride />
    <WebFilePicker />
    <MigrationModal
      v-if="isMigrationModalVisible"
      v-model:visible="isMigrationModalVisible"
      :source-channel="migrationSourceChannel"
    />
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, provide, watch } from "vue";
import { handle } from "./composables/handlers";
import { useLogger, MigrationChannel, MessageSchema, Locales } from "@pipelab/shared";
import { useI18n } from "vue-i18n";
import UpgradeDialog from "./components/UpgradeDialog.vue";
import DevBenefitsOverride from "./components/DevBenefitsOverride.vue";
import WebFilePicker from "./components/WebFilePicker.vue";
import Dialog from "primevue/dialog";
import Toast from "primevue/toast";
import MigrationModal from "./components/MigrationModal.vue";
import { OpenMigrationModalKey, OpenUpgradeDialogKey } from "./utils/injection-keys";
import { useAgentAvailability } from "./composables/useAgentAvailability";
import { useAppSettings } from "./store/settings";

const { logger } = useLogger();
const { start, isReady } = useAgentAvailability();
const { locale, availableLocales } = useI18n<{ message: MessageSchema }, Locales>();
const settingsStore = useAppSettings();
const isUpgradeDialogVisible = ref(false);

const isMigrationModalVisible = ref(false);
const migrationSourceChannel = ref<MigrationChannel | undefined>(undefined);
const openMigrationModal = (sourceChannel?: MigrationChannel) => {
  migrationSourceChannel.value = sourceChannel;
  isMigrationModalVisible.value = true;
};
provide(OpenMigrationModalKey, openMigrationModal);

const openUpgradeDialog = () => {
  isUpgradeDialogVisible.value = true;
};

const closeUpgradeDialog = () => {
  isUpgradeDialogVisible.value = false;
};

provide(OpenUpgradeDialogKey, openUpgradeDialog);

watch(
  () => settingsStore.settings?.theme,
  (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  },
  { immediate: true },
);

watch(
  () => settingsStore.settings?.locale,
  (savedLocale) => {
    const supportedLocale = availableLocales.find((available) => available === savedLocale);
    if (supportedLocale) locale.value = supportedLocale;
  },
  { immediate: true },
);

watch(isReady, (ready) => {
  if (ready) {
    void settingsStore.load().catch((error) => logger().warn("Unable to load settings:", error));
  }
});

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

onMounted(() => {
  start().catch((error) => logger().warn("Unable to connect to Pipelab agent:", error));
});
</script>

<style lang="scss">
.app {
  height: 100%;
  overflow: hidden;
}
</style>
