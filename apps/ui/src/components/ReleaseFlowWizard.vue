<template>
  <Dialog v-model:visible="visible" modal :style="{ width: '620px', maxWidth: '96vw' }" header="New release flow">
    <Stepper v-model:value="activeStep" linear class="wizard">
      <StepList>
        <Step value="details" asChild v-slot="{ activateCallback, a11yAttrs }"><button class="custom-step" v-bind="a11yAttrs.header" @click="activateCallback"><i class="mdi mdi-information-outline step-icon" /><span>Details</span></button></Step>
        <Step value="source" asChild v-slot="{ activateCallback, a11yAttrs }"><button class="custom-step" v-bind="a11yAttrs.header" @click="activateCallback"><i class="mdi mdi-source-branch step-icon" /><span>Source</span></button></Step>
        <Step value="destinations" asChild v-slot="{ activateCallback, a11yAttrs }"><button class="custom-step" v-bind="a11yAttrs.header" @click="activateCallback"><i class="mdi mdi-upload-multiple step-icon" /><span>Destinations</span></button></Step>
        <Step value="review" asChild v-slot="{ activateCallback, a11yAttrs }"><button class="custom-step" v-bind="a11yAttrs.header" @click="activateCallback"><i class="mdi mdi-check-circle-outline step-icon" /><span>Review</span></button></Step>
      </StepList>
      <StepPanels>
      <StepPanel v-slot="{ activateCallback }" value="details">
      <div class="form">
        <h3>Name your release flow</h3><p>Keep it recognizable in your project list.</p>
        <label>Name <InputText v-model="draft.name" autofocus placeholder="Release to Steam" /></label>
        <label>Description <Textarea v-model="draft.description" rows="2" placeholder="Optional" /></label>
        <div class="footer next"><Button label="Continue" :disabled="!draft.name.trim()" @click="activateCallback('source')" /></div></div>
      </StepPanel>
      <StepPanel v-slot="{ activateCallback }" value="source"><div class="form">
        <h3>Choose a source</h3><p>We’ll build the release from this location.</p>
        <div class="choice-grid source-grid"><label v-for="source in sourceOptions" :key="source.type" class="choice-card" :class="{ selected: draft.source.type === source.type }"><input v-model="draft.source.type" type="radio" name="release-source" :value="source.type" /><i class="mdi source-icon" :class="source.icon" /><span>{{ source.label }}</span><i v-if="draft.source.type === source.type" class="mdi mdi-check-circle selection-mark" /></label></div>
        <label>{{ sourceInputLabel }}
          <div class="file-picker">
            <input
              :key="draft.source.type"
              ref="sourceInput"
              class="native-file-input"
              type="file"
              :accept="sourceAccept"
              :webkitdirectory="isFolderSource ? '' : undefined"
              :directory="isFolderSource ? '' : undefined"
              @change="onSourceFileChange"
            />
            <span v-if="draft.source.path" class="selected-path" :title="draft.source.path">{{ draft.source.path }}</span>
            <span v-else class="selected-path placeholder">{{ sourcePlaceholder }}</span>
          </div>
        </label>
        <div class="footer"><Button label="Back" text severity="secondary" @click="activateCallback('details')" /><Button label="Continue" :disabled="!draft.source.path" @click="activateCallback('destinations')" /></div></div>
      </StepPanel>
      <StepPanel v-slot="{ activateCallback }" value="destinations"><div class="form">
        <h3>Where should it go?</h3><p>Select one or more destinations. You can configure details next.</p>
        <div class="choice-grid"><button v-for="target in targetOptions" :key="target.type" :class="{ selected: selected(target.type) }" @click="toggleTarget(target.type)"><i class="mdi" :class="target.icon" />{{ target.label }}<i v-if="selected(target.type)" class="mdi mdi-check check" /></button></div>
        <div class="footer"><Button label="Back" text severity="secondary" @click="activateCallback('source')" /><Button label="Continue" :disabled="draft.destinations.length === 0" @click="activateCallback('review')" /></div></div>
      </StepPanel>
      <StepPanel value="review"><div class="form review"><h3>Ready to create</h3><div class="summary"><b>{{ draft.name || 'Untitled release flow' }}</b><span>{{ draft.source.type === 'construct3' ? 'Construct 3' : 'Built folder' }} · {{ draft.source.path || 'No path yet' }}</span><span>{{ destinationLabels }}</span></div><p>Configure destination details after creation from each destination card.</p><div class="footer"><Button label="Back" text severity="secondary" @click="activeStep = 'destinations'" /><Button label="Create release flow" @click="create" /></div></div></StepPanel>
      </StepPanels>
    </Stepper>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Dialog from "primevue/dialog"; import Stepper from "primevue/stepper"; import StepList from "primevue/steplist"; import Step from "primevue/step"; import StepPanels from "primevue/steppanels"; import StepPanel from "primevue/steppanel"; import InputText from "primevue/inputtext"; import Textarea from "primevue/textarea"; import Button from "primevue/button";
import { nanoid } from "nanoid"; import type { ReleaseFlow } from "@pipelab/shared";
const props = defineProps<{ visible: boolean; projectId: string }>(); const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'create', flow: ReleaseFlow): void }>();
const visible = computed({ get: () => props.visible, set: (v) => emit('update:visible', v) }); const activeStep = ref('details');
const sourceInput = ref<HTMLInputElement>();
const draft = ref<any>({ name: '', description: '', source: { type: 'construct3', path: '' }, destinations: [] });
const sourceOptions: Array<{ type: 'construct3' | 'folder'; label: string; icon: string }> = [{ type: 'construct3', label: 'Construct 3', icon: 'mdi-cube-outline' }, { type: 'folder', label: 'Built folder', icon: 'mdi-folder-outline' }]; const targetOptions = [{ type: 'steam', label: 'Steam', icon: 'mdi-steam' }, { type: 'itch', label: 'Itch.io', icon: 'mdi-puzzle-outline' }, { type: 'web', label: 'Web folder', icon: 'mdi-web' }];
watch(() => props.visible, (open) => { if (open) { activeStep.value = 'details'; draft.value = { name: '', description: '', source: { type: 'construct3', path: '' }, destinations: [] }; } });
watch(() => draft.value.source.type, () => { draft.value.source.path = ''; if (sourceInput.value) sourceInput.value.value = ''; });
const isFolderSource = computed(() => draft.value.source.type === 'folder');
const sourceAccept = computed(() => isFolderSource.value ? undefined : '.c3p,.c3proj');
const sourceInputLabel = computed(() => isFolderSource.value ? 'Build folder' : 'Construct 3 project');
const sourcePlaceholder = computed(() => isFolderSource.value ? 'Choose a folder' : 'Choose a .c3p project file');
const selected = (type: string) => draft.value.destinations.some((d: any) => d.type === type);
const toggleTarget = (type: string) => { const i = draft.value.destinations.findIndex((d: any) => d.type === type); if (i >= 0) draft.value.destinations.splice(i, 1); else draft.value.destinations.push(type === 'steam' ? { type, connectionId: '', appId: '' } : type === 'itch' ? { type, connectionId: '', project: '', channel: '' } : { type, outputDir: '' }); };
const destinationLabels = computed(() => draft.value.destinations.map((d: any) => d.type === 'web' ? 'Web folder' : d.type === 'steam' ? 'Steam' : 'Itch.io').join(' · '));
const onSourceFileChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0] as (File & { path?: string; webkitRelativePath?: string }) | undefined;
  if (!file) return;
  const absolutePath = file.path || '';
  if (!isFolderSource.value) {
    draft.value.source.path = absolutePath || file.name;
    return;
  }
  const relativePath = file.webkitRelativePath || file.name;
  const rootName = relativePath.split(/[\\/]/)[0];
  draft.value.source.path = absolutePath && rootName ? absolutePath.slice(0, Math.max(0, absolutePath.lastIndexOf(rootName) + rootName.length)) : rootName;
};
const create = () => { emit('create', { version: '1.0.0', id: nanoid(), project: props.projectId, ...draft.value }); visible.value = false; activeStep.value = 'details'; };
</script>

<style scoped>
.wizard { color: var(--text-color); min-width: 0; }
.wizard :deep(.p-steplist) { display:flex; width:100%; overflow:hidden; }
.wizard :deep(.p-step) { flex:1; min-width:0; }
.wizard :deep(.p-steplist) { align-items:stretch; }.wizard :deep(.custom-step) { display:flex; width:100%; align-items:center; justify-content:center; gap:7px; padding:11px 8px; color:var(--text-color-secondary); background:transparent; border:0; border-bottom:2px solid transparent; font:inherit; cursor:pointer; white-space:nowrap; }.wizard :deep(.custom-step:hover) { color:var(--text-color); background:var(--surface-hover); }.wizard :deep(.custom-step[aria-selected="true"]) { color:var(--primary-color); border-bottom-color:var(--primary-color); font-weight:600; }.wizard :deep(.custom-step .step-icon) { font-size:18px; }.wizard :deep(.custom-step:disabled) { opacity:.55; cursor:not-allowed; }
.form { display:flex; flex-direction:column; gap:14px; min-height:280px; }.form h3 { margin:0; }.form p { margin:0; color:var(--text-color-secondary); }.form label { display:flex; flex-direction:column; gap:6px; font-size:13px; }.form input,.form textarea { width:100%; }.file-picker { display:flex; flex-direction:column; gap:8px; min-width:0; }.native-file-input { width:100%; padding:8px; color:var(--text-color); background:var(--surface-ground); border:1px solid var(--surface-border); border-radius:6px; cursor:pointer; }.native-file-input::file-selector-button { margin-right:10px; padding:6px 12px; color:var(--primary-color-text); background:var(--primary-color); border:0; border-radius:4px; cursor:pointer; }.selected-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--text-color-secondary); }.selected-path.placeholder { opacity:.75; }.inline { display:flex; gap:8px; }.inline input { flex:1; }.choice-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }.source-grid { grid-template-columns:repeat(2,1fr); }.choice-grid button,.choice-card { position:relative; display:flex; flex-direction:column; gap:8px; align-items:center; justify-content:center; padding:18px 8px; background:var(--surface-ground); border:1px solid var(--surface-border); border-radius:8px; color:inherit; cursor:pointer; transition:border-color .15s,background .15s,box-shadow .15s; }.choice-card input { position:absolute; opacity:0; pointer-events:none; }.choice-grid button.selected,.choice-card.selected { border:2px solid var(--primary-color); padding:17px 7px; background:color-mix(in srgb,var(--primary-color) 18%,var(--surface-ground)); box-shadow:0 0 0 2px color-mix(in srgb,var(--primary-color) 18%,transparent); }.source-icon { font-size:28px!important; }.selection-mark { position:absolute; top:8px; right:8px; font-size:18px!important; color:var(--primary-color); }.choice-grid .mdi { font-size:24px; }.check { position:absolute; top:6px; right:6px; font-size:14px!important; color:var(--primary-color); }.review .summary { display:flex; flex-direction:column; gap:10px; padding:18px; background:var(--surface-ground); border-radius:8px; }.footer { display:flex; justify-content:space-between; margin-top:auto; padding-top:16px; }.footer.next { justify-content:flex-end; }
</style>
