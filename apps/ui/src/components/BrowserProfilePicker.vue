<template>
  <div class="profile-picker">
    <div class="profile-picker-row">
      <Select
        v-model="selectedPath"
        :options="profileOptions"
        optionLabel="label"
        optionValue="path"
        :placeholder="loading ? 'Detecting browser profiles…' : 'Select a browser profile'"
        :loading="loading"
        filter
        showClear
        class="profile-select"
        @update:model-value="emitValue"
      />
      <Button
        icon="pi pi-refresh"
        outlined
        aria-label="Detect browser profiles"
        :loading="loading"
        @click="discover(true)"
      />
    </div>
    <small v-if="selectedProfile" class="profile-help"
      >{{ selectedProfile.browser }} · {{ selectedProfile.authStatus || "auth status unknown"
      }}<span v-if="selectedProfile.reason"> · {{ selectedProfile.reason }}</span></small
    >
    <small v-else class="profile-help"
      >Profiles are detected from installed browsers and checked for Construct data.</small
    >
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import Select from "primevue/select";
import type { BrowserProfileCandidate } from "@pipelab/shared";
import { useAPI } from "../composables/api";

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const api = useAPI();
const profiles = ref<BrowserProfileCandidate[]>([]);
const loading = ref(false);
const selectedPath = ref(props.modelValue || "");
const profileOptions = computed(() =>
  profiles.value.map((profile) => ({
    ...profile,
    label: `${profile.browser} — ${profile.profileName}${profile.isDefault ? " (default)" : ""}`,
  })),
);
const selectedProfile = computed(() =>
  profiles.value.find((profile) => profile.path === selectedPath.value),
);
const emitValue = (value: string | undefined) => {
  selectedPath.value = value || "";
  emit("update:modelValue", selectedPath.value);
};
const discover = async (forceRefresh = false) => {
  loading.value = true;
  const result = await api.execute("construct:profiles:discover", { forceRefresh });
  if (result.type === "success") profiles.value = result.result;
  loading.value = false;
};
onMounted(() => void discover());
</script>

<style scoped>
.profile-picker {
  display: grid;
  gap: 5px;
}
.profile-picker-row {
  display: flex;
  gap: 6px;
}
.profile-select {
  flex: 1;
  min-width: 0;
}
.profile-help {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
}
</style>
