<template>
  <Layout>
    <WorkflowShell :flow-id="String(route.params.flowId)" :project-id="String(route.params.projectId)" title="Release" subtitle="Catalogue-driven release configuration" active="configuration">
      <template #actions><Button label="Save" :disabled="!flow" @click="save" /><Button label="Ship" :disabled="!flow" @click="ship" /></template>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <section v-if="flow" class="release-editor">
        <label>Name <InputText v-model="flow.name" /></label>
        <label>Source <Select v-model="flow.source.provider" :options="catalog.sources" optionLabel="label" optionValue="id" /></label>
        <label>Path <InputText :model-value="String(flow.source.config.path || '')" @update:model-value="flow.source.config.path = String($event)" @blur="inspectSource" /></label>
        <h3>Available producers</h3><div class="catalog-grid"><button v-for="provider in catalog.producers" :key="provider.id" :class="{ selected: flow.producers.some((item) => item.provider === provider.id) }" @click="toggleProducer(provider.id)">{{ provider.label }}</button></div>
        <div v-for="producer in flow.producers" :key="producer.id" class="release-provider">
          <strong>{{ producer.id }}</strong>
          <label v-for="field in producerDefinition(producer.provider)?.fields || []" :key="field.key">{{ field.label }} <InputText :type="field.type === 'password' ? 'password' : 'text'" :model-value="fieldValue(producer.config, field.key)" @update:model-value="setField(producer.config, field.key, $event)" /></label>
          <label v-for="target in catalog.producers.find((item) => item.id === producer.provider)?.targets || []" :key="target.id"><input type="checkbox" :checked="producer.targets.some((item) => item.id === target.id && item.enabled)" @change="toggleTarget(producer, target.id, ($event.target as HTMLInputElement).checked)" /> {{ target.label }}</label>
          <div v-for="target in producer.targets.filter((item) => item.enabled)" :key="`${producer.id}-${target.id}`"><label v-for="field in targetDefinition(producer.provider, target.id)?.fields || []" :key="field.key">{{ field.label }} <Select v-if="field.type === 'select' && field.options?.length" :model-value="fieldValue(target.config, field.key)" :options="field.options" optionLabel="label" optionValue="value" @update:model-value="setTargetField(target.config, field.key, $event)" /><InputText v-else :model-value="fieldValue(target.config, field.key)" @update:model-value="setTargetField(target.config, field.key, $event)" /></label></div>
        </div>
        <h3>Available destinations</h3><div class="catalog-grid"><button v-for="provider in catalog.destinations" :key="provider.id" :class="{ selected: flow.destinations.some((item) => item.provider === provider.id) }" @click="toggleDestination(provider.id)">{{ provider.label }}</button></div>
        <div v-for="destination in flow.destinations" :key="destination.id" class="release-provider">
          <strong>{{ destination.id }}</strong>
          <label v-for="field in destinationDefinition(destination.provider)?.fields || []" :key="field.key">{{ field.label }} <InputText :type="field.type === 'password' ? 'password' : 'text'" :model-value="fieldValue(destination.config, field.key)" @update:model-value="setField(destination.config, field.key, $event)" /></label>
          <Button label="Add slot" size="small" text @click="addSlot(destination)" />
          <div v-for="slot in destination.slots" :key="slot.id" class="release-slot">
            <Select :model-value="slotArtifactValue(slot)" :options="compatibleArtifacts(destination.provider)" optionLabel="label" optionValue="value" placeholder="Select artifact" @update:model-value="setSlotArtifact(slot, $event)" />
            <label v-for="field in destinationDefinition(destination.provider)?.slotFields || []" :key="field.key">{{ field.label }} <InputText :model-value="fieldValue(slot.config, field.key)" @update:model-value="setField(slot.config, field.key, $event)" /></label>
            <Button icon="pi pi-trash" severity="danger" text @click="removeSlot(destination, slot.id)" />
          </div>
        </div>
        <Message v-if="issues.length" severity="warn"><ul><li v-for="issue in issues" :key="issue.code + issue.path">{{ issue.message }}</li></ul></Message>
      </section>
    </WorkflowShell>
  </Layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Message from "primevue/message";
import { matchesArtifact, type ArtifactDescriptor, type ReleaseCatalog, type ReleaseConfig, type ReleaseDestinationConfig, type ReleaseFieldDefinition, type ReleaseProducerConfig, type ReleaseDestinationSlot, type ValidationIssue } from "@pipelab/shared";
import { useAPI } from "../composables/api";
const route = useRoute(); const api = useAPI();
const catalog = ref<ReleaseCatalog>({ sources: [], producers: [], destinations: [] }); const flow = ref<ReleaseConfig>(); const issues = ref<ValidationIssue[]>([]); const error = ref("");
const godotPresetPlatforms = ref<Record<string, string>>({});
const producerDefinition = (id: string) => catalog.value.producers.find((item) => item.id === id);
const targetDefinition = (provider: string, id: string) => producerDefinition(provider)?.targets.find((item) => item.id === id);
const destinationDefinition = (id: string) => catalog.value.destinations.find((item) => item.id === id);
const fieldValue = (config: Record<string, unknown>, key: string) => String(config[key] ?? "");
const setField = (config: Record<string, unknown>, key: string, value: unknown) => { config[key] = String(value ?? ""); };
const setTargetField = (config: Record<string, unknown>, key: string, value: unknown) => { setField(config, key, value); if (key === "preset") config.presetPlatform = godotPresetPlatforms.value[String(value)] || ""; };
const inspectProducer = async (producer: ReleaseProducerConfig) => { const result = await api.execute("release:producer:inspect", { provider: producer.provider, config: producer }); if (result.type === "success") issues.value = (result.result as { issues?: ValidationIssue[] }).issues || []; };
const producedArtifacts = computed(() => (flow.value?.producers || []).flatMap((producer) => (producer.targets || []).filter((target) => target.enabled).flatMap((target) => { const definition = targetDefinition(producer.provider, target.id); return definition ? [{ value: `${producer.id}:${target.id}`, label: `${producer.id} / ${target.id}`, producerId: producer.id, outputId: target.id, descriptor: definition.output }] : []; })));
const compatibleArtifacts = (provider: string) => producedArtifacts.value.filter((artifact) => matchesArtifact(artifact.descriptor, destinationDefinition(provider)?.accepts || {}));
const slotArtifactValue = (slot: ReleaseDestinationSlot) => `${slot.input.producerId}:${slot.input.outputId}`;
const setSlotArtifact = (slot: ReleaseDestinationSlot, value: string) => { const artifact = producedArtifacts.value.find((item) => item.value === value); if (artifact) slot.input = { producerId: artifact.producerId, outputId: artifact.outputId }; };
const inspectSource = async () => { if (!flow.value || !flow.value.source.provider) return; const result = await api.execute("release:source:inspect", { provider: flow.value.source.provider, config: flow.value.source.config }); if (result.type !== "success") return; const inspected = result.result as { data?: { presets?: string[]; presetPlatforms?: Record<string, string> }; issues?: ValidationIssue[] }; godotPresetPlatforms.value = inspected.data?.presetPlatforms || {}; issues.value = inspected.issues || []; const presets = inspected.data?.presets || []; for (const producer of catalog.value.producers) for (const target of producer.targets) { const field = target.fields?.find((item) => item.key === "preset"); if (field) field.options = presets.map((preset) => ({ label: preset, value: preset })); } };
onMounted(async () => { const [catalogResult, flowResult] = await Promise.all([api.execute("release:catalog:get"), api.execute("workflow:load-by-name", { name: `workflows/${route.params.flowId}` })]); if (catalogResult.type === "success") catalog.value = catalogResult.result; if (flowResult.type === "success") { flow.value = flowResult.result as ReleaseConfig; await inspectSource(); } else error.value = flowResult.ipcError; });
const toggleProducer = (provider: string) => { if (!flow.value) return; const index = flow.value.producers.findIndex((item) => item.provider === provider); if (index >= 0) flow.value.producers.splice(index, 1); else { const definition = catalog.value.producers.find((item) => item.id === provider); flow.value.producers.push({ id: provider.split("/").pop() || provider, provider, enabled: true, targets: (definition?.targets || []).map((target, targetIndex) => ({ id: target.id, enabled: targetIndex === 0, config: { ...target.defaultConfig } })), config: { ...(definition?.defaultConfig || {}) } }); } };
const toggleTarget = (producer: ReleaseConfig["producers"][number], targetId: string, enabled: boolean) => { const target = producer.targets.find((item) => item.id === targetId); if (target) target.enabled = enabled; else { const definition = catalog.value.producers.find((item) => item.id === producer.provider)?.targets.find((item) => item.id === targetId); producer.targets.push({ id: targetId, enabled, config: { ...(definition?.defaultConfig || {}) } }); } void inspectProducer(producer); };
const toggleDestination = (provider: string) => { if (!flow.value) return; const index = flow.value.destinations.findIndex((item) => item.provider === provider); if (index >= 0) flow.value.destinations.splice(index, 1); else { const definition = catalog.value.destinations.find((item) => item.id === provider); flow.value.destinations.push({ id: provider.split("/").pop() || provider, provider, enabled: true, config: { ...(definition?.defaultConfig || {}) }, slots: [] }); } };
const addSlot = (destination: ReleaseDestinationConfig) => { const artifact = compatibleArtifacts(destination.provider)[0]; if (!artifact) return; destination.slots.push({ id: `${destination.id}-${destination.slots.length + 1}`, enabled: true, input: { producerId: artifact.producerId, outputId: artifact.outputId }, config: {} }); };
const removeSlot = (destination: ReleaseDestinationConfig, slotId: string) => { destination.slots = destination.slots.filter((slot) => slot.id !== slotId); };
const save = async () => { if (!flow.value) return; const result = await api.execute("workflow:save-by-name", { name: `workflows/${route.params.flowId}`, data: JSON.stringify(flow.value) }); if (result.type === "error") error.value = result.ipcError; };
const ship = async () => { if (!flow.value) return; error.value = ""; const validation = await api.execute("release:validate", { config: flow.value }); if (validation.type === "error") { error.value = validation.ipcError; return; } issues.value = validation.result.issues; if (issues.value.some((issue) => issue.severity === "error")) return; const saved = await api.execute("workflow:save-by-name", { name: `workflows/${route.params.flowId}`, data: JSON.stringify(flow.value) }); if (saved.type === "error") { error.value = saved.ipcError; return; } const result = await api.execute("workflow:execute", { name: `workflows/${route.params.flowId}`, release: { version: "0.0.0", description: flow.value.description || "" } }); if (result.type === "error") error.value = result.ipcError; };
</script>
