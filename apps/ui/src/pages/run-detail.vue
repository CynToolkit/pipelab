<template>
  <Layout>
    <main class="run-page">
      <header><Button text icon="pi pi-arrow-left" label="Runs" @click="back" /><h1>{{ entry?.workflowName || entry?.projectName || "Run" }}</h1><Tag v-if="entry" :value="entry.status" :severity="entry.status === 'completed' ? 'success' : entry.status === 'failed' ? 'danger' : 'warn'" /><Button v-if="entry?.status === 'running'" label="Cancel" severity="danger" text :disabled="cancelling" @click="cancel" /></header>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <p v-else-if="!entry">Loading run…</p>
      <template v-else>
        <section><h2>Summary</h2><p>Started {{ new Date(entry.startTime).toLocaleString() }} · Duration {{ duration }}</p><p>{{ entry.completedSteps }}/{{ entry.totalSteps }} steps completed · {{ entry.artifacts?.length || 0 }} artifacts · {{ entry.deliveries?.length || 0 }} deliveries</p><Message v-if="entry.error" severity="error">{{ entry.error.message }}</Message></section>
        <section><h2>Steps</h2><p v-if="!entry.steps.length">Waiting for steps…</p><button v-for="step in entry.steps" :key="step.id" class="step-row" :class="{ selected: selectedStep === step.id }" @click="selectedStep = selectedStep === step.id ? '' : step.id"><span>{{ step.name }}</span><Tag :value="step.status" /></button><p v-if="selectedStep && entry.steps.find(step => step.id === selectedStep)?.error" class="step-error">{{ entry.steps.find(step => step.id === selectedStep)?.error?.message }}</p><Button v-if="selectedStep" text label="All logs" @click="selectedStep = ''" /><h3>{{ selectedStep ? `Logs · ${selectedStep}` : "All logs" }}</h3><pre>{{ visibleLogs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.source ? `[${log.source}] ` : ""}${log.message}`).join("\n") || "No logs recorded." }}</pre></section>
        <section><h2>Artifacts</h2><p v-if="!entry.artifacts?.length">No artifacts recorded.</p><div v-for="artifact in entry.artifacts || []" :key="artifact.id">{{ artifact.outputId || artifact.name }} <small>{{ artifact.path }}</small></div></section>
        <section><h2>Deliveries</h2><p v-if="!entry.deliveries?.length">No deliveries recorded.</p><div v-for="delivery in entry.deliveries || []" :key="delivery.id">{{ delivery.destinationId }} · {{ delivery.slotId }} · {{ delivery.status }}<small v-if="delivery.error"> — {{ delivery.error }}</small></div></section>
      </template>
    </main>
  </Layout>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Layout from "@renderer/components/Layout.vue";
import Button from "primevue/button"; import Tag from "primevue/tag"; import Message from "primevue/message";
import { useAPI } from "@renderer/composables/api"; import type { BuildHistoryEntry } from "@pipelab/shared";
const route=useRoute(); const router=useRouter(); const api=useAPI(); const entry=ref<BuildHistoryEntry>(); const error=ref(""); const selectedStep=ref(""); let timer: ReturnType<typeof setTimeout> | undefined;
const cancelling=ref(false);
const duration=computed(()=>{if(!entry.value)return "—";return `${Math.floor((entry.value.duration ?? Date.now()-entry.value.startTime)/1000)}s`});
const visibleLogs=computed(()=>selectedStep.value ? entry.value?.steps.find(step=>step.id===selectedStep.value)?.logs || [] : entry.value?.logs || []);
const load=async()=>{const response=await api.execute("build-history:get",{id:String(route.params.runId)});if(response.type==="error"){error.value=response.ipcError;return}entry.value=response.result.entry;if(entry.value?.status==="running")timer=setTimeout(load,1000)};
const back=()=>entry.value?.workflowId ? router.push(`/workflows/${entry.value.workflowId}/${entry.value.pipelineId}/runs`) : router.back();
const cancel=async()=>{cancelling.value=true;const response=await api.execute("workflow:cancel");if(response.type==="error")error.value=response.ipcError;cancelling.value=false};
onMounted(load); onUnmounted(()=>{if(timer)clearTimeout(timer)});
</script>
<style scoped>
.run-page{max-width:1000px;margin:auto;padding:28px}.run-page header{display:flex;align-items:center;gap:16px;margin-bottom:20px}.run-page h1{margin:0;flex:1}.run-page section{padding:18px;margin:14px 0;border:1px solid var(--surface-border);border-radius:10px;background:var(--surface-card)}.step-row{display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px;border:0;border-bottom:1px solid var(--surface-border);background:transparent;color:inherit;text-align:left;cursor:pointer}.step-row.selected{background:var(--surface-hover)}.step-error{color:var(--red-500)}pre{max-height:360px;overflow:auto;white-space:pre-wrap;background:var(--surface-ground);padding:12px;border-radius:6px}small{display:block;color:var(--text-color-secondary)}
</style>
