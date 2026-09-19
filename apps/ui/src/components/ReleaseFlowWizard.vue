<template>
  <Dialog v-model:visible="visible" modal header="New release" :style="{ width: '620px', maxWidth: '96vw' }">
    <div class="form">
      <label>Name <InputText v-model="draft.name" /></label>
      <label>Description <Textarea v-model="draft.description" rows="2" /></label>
      <label>Source <Select v-model="draft.source.provider" :options="catalog.sources" optionLabel="label" optionValue="id" placeholder="Choose a source" /></label>
      <label>Source path <InputText v-model="draft.source.config.path" /></label>
      <div class="catalog-list"><span v-for="provider in catalog.destinations" :key="provider.id" class="catalog-chip">{{ provider.label }}</span></div>
      <div class="footer"><Button label="Cancel" text @click="visible = false" /><Button label="Create" :disabled="!draft.name || !draft.source.provider" @click="create" /></div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Select from "primevue/select";
import Button from "primevue/button";
import { nanoid } from "nanoid";
import type { ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";
import { useAPI } from "../composables/api";
const props = defineProps<{ visible: boolean; projectId: string }>();
const emit = defineEmits<{ "update:visible": [value: boolean]; create: [flow: ReleaseConfig] }>();
const api = useAPI();
const visible = computed({ get: () => props.visible, set: (value) => emit("update:visible", value) });
const catalog = ref<ReleaseCatalog>({ sources: [], producers: [], destinations: [] });
const draft = ref({ name: "", description: "", source: { provider: "", config: { path: "" } } });
watch(() => props.visible, async (open) => { if (!open) return; const result = await api.execute("release:catalog:get"); if (result.type === "success") { catalog.value = result.result; draft.value.source.provider = catalog.value.sources[0]?.id || ""; } });
const create = () => { emit("create", { version: "3.0.0", id: nanoid(), project: props.projectId, name: draft.value.name, description: draft.value.description, source: draft.value.source, producers: [], destinations: [] }); visible.value = false; };
</script>
