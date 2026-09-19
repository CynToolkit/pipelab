<template>
  <Layout>
    <WorkflowShell :flow-id="String(route.params.flowId)" :project-id="String(route.params.projectId)" title="Release" subtitle="Catalogue-driven release configuration" active="configuration">
      <template #actions><Button label="Save" :disabled="!flow" @click="save" /><Button label="Ship" :disabled="!flow" @click="ship" /></template>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <section v-if="flow" class="release-editor">
        <label>Name <InputText v-model="flow.name" /></label>
        <label>Source <Select v-model="flow.source.provider" :options="catalog.sources" optionLabel="label" optionValue="id" /></label>
        <label>Path <InputText v-model="flow.source.config.path" /></label>
        <h3>Available producers</h3><div class="catalog-grid"><button v-for="provider in catalog.producers" :key="provider.id" :class="{ selected: flow.producers.some((item) => item.provider === provider.id) }" @click="toggleProducer(provider.id)">{{ provider.label }}</button></div>
        <h3>Available destinations</h3><div class="catalog-grid"><button v-for="provider in catalog.destinations" :key="provider.id" :class="{ selected: flow.destinations.some((item) => item.provider === provider.id) }" @click="toggleDestination(provider.id)">{{ provider.label }}</button></div>
        <Message v-if="issues.length" severity="warn"><ul><li v-for="issue in issues" :key="issue.code + issue.path">{{ issue.message }}</li></ul></Message>
      </section>
    </WorkflowShell>
  </Layout>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Message from "primevue/message";
import type { ReleaseCatalog, ReleaseConfig, ValidationIssue } from "@pipelab/shared";
import { useAPI } from "../composables/api";
const route = useRoute(); const api = useAPI();
const catalog = ref<ReleaseCatalog>({ sources: [], producers: [], destinations: [] }); const flow = ref<ReleaseConfig>(); const issues = ref<ValidationIssue[]>([]); const error = ref("");
onMounted(async () => { const [catalogResult, flowResult] = await Promise.all([api.execute("release:catalog:get"), api.execute("workflow:load-by-name", { name: `workflows/${route.params.flowId}` })]); if (catalogResult.type === "success") catalog.value = catalogResult.result; if (flowResult.type === "success") flow.value = flowResult.result; else error.value = flowResult.ipcError; });
const toggleProducer = (provider: string) => { if (!flow.value) return; const index = flow.value.producers.findIndex((item) => item.provider === provider); if (index >= 0) flow.value.producers.splice(index, 1); else flow.value.producers.push({ id: provider.split("/").pop() || provider, provider, enabled: true, targets: [], config: {} }); };
const toggleDestination = (provider: string) => { if (!flow.value) return; const index = flow.value.destinations.findIndex((item) => item.provider === provider); if (index >= 0) flow.value.destinations.splice(index, 1); else flow.value.destinations.push({ id: provider.split("/").pop() || provider, provider, enabled: true, config: {}, slots: [] }); };
const save = async () => { if (!flow.value) return; const result = await api.execute("workflow:save-by-name", { name: `workflows/${route.params.flowId}`, data: JSON.stringify(flow.value) }); if (result.type === "error") error.value = result.ipcError; };
const ship = async () => { if (!flow.value) return; const result = await api.execute("release:validate", { config: flow.value }); if (result.type === "success") issues.value = result.result.issues; };
</script>
