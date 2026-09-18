<template>
  <Layout>
    <main class="runs-page">
      <header><Button text icon="pi pi-arrow-left" label="Workflow" @click="router.push(`/workflows/${route.params.flowId}/${route.params.projectId}`)" /><h1>Runs</h1></header>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <p v-else-if="loading">Loading runs…</p>
      <p v-else-if="!entries.length">No runs yet. Start a workflow execution to see it here.</p>
      <div v-else class="run-list">
        <button v-for="entry in entries" :key="entry.id" class="run-row" @click="router.push(`/runs/${entry.id}`)">
          <span><strong>{{ entry.workflowName || entry.projectName }}</strong><small>{{ new Date(entry.startTime).toLocaleString() }}</small></span>
          <Tag :value="entry.status" :severity="entry.status === 'completed' ? 'success' : entry.status === 'failed' ? 'danger' : 'warn'" />
          <span>{{ duration(entry) }}</span>
          <small>{{ entry.completedSteps }}/{{ entry.totalSteps }} steps · {{ entry.artifacts?.length || 0 }} artifacts · {{ entry.deliveries?.length || 0 }} deliveries</small>
        </button>
      </div>
    </main>
  </Layout>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Layout from "@renderer/components/Layout.vue";
import Button from "primevue/button";
import Tag from "primevue/tag";
import Message from "primevue/message";
import { useAPI } from "@renderer/composables/api";
import type { BuildHistoryEntry } from "@pipelab/shared";
const route = useRoute(); const router = useRouter(); const api = useAPI();
const entries = ref<BuildHistoryEntry[]>([]); const loading = ref(true); const error = ref("");
const duration = (entry: BuildHistoryEntry) => { const ms = entry.duration ?? Date.now() - entry.startTime; return `${Math.floor(ms / 1000)}s`; };
onMounted(async () => {
  const response = await api.execute("build-history:get-all", { query: { workflowId: String(route.params.flowId) } });
  if (response.type === "error") error.value = response.ipcError;
  else entries.value = response.result.entries;
  loading.value = false;
});
</script>
<style scoped>
.runs-page{max-width:1000px;margin:auto;padding:28px}.runs-page header{display:flex;align-items:center;gap:16px;margin-bottom:20px}.runs-page h1{margin:0}.run-list{display:grid;gap:10px}.run-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px 16px;text-align:left;padding:16px;border:1px solid var(--surface-border);border-radius:10px;background:var(--surface-card);color:var(--text-color);cursor:pointer}.run-row span:first-child{display:grid}.run-row small{color:var(--text-color-secondary)}@media(max-width:600px){.run-row{grid-template-columns:1fr auto}.run-row>small{grid-column:1/-1}}
</style>
