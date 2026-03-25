<template>
  <div class="simple-editor-page">
    <Layout>
      <div class="p-4 h-full flex flex-column overflow-hidden">
        <div class="flex justify-content-between align-items-center mb-4">
          <h1 class="text-xl m-0 font-bold">Simplified Editor</h1>
          <Button
            outlined
            label="Close"
            icon="mdi mdi-close"
            size="small"
            @click="router.push('/')"
          />
        </div>

        <div class="flex-grow-1 overflow-y-auto">
          <Accordion :value="['source', 'packaging', 'publishing']" multiple>
            
            <!-- Source Selection -->
            <AccordionPanel value="source">
              <AccordionHeader>1. Source Selection</AccordionHeader>
              <AccordionContent>
                <div class="flex flex-column gap-3">
                  <label class="font-semibold">Project Type</label>
                  <div class="flex flex-wrap gap-3">
                    <div v-for="type in sourceTypes" :key="type.value" class="flex align-items-center">
                      <RadioButton v-model="selectedSourceType" :inputId="type.value" :value="type.value" />
                      <label :for="type.value" class="ml-2 cursor-pointer">{{ type.label }}</label>
                    </div>
                  </div>

                  <label class="font-semibold mt-2">Source Path</label>
                  <div class="flex gap-2">
                    <InputText v-model="sourcePath" class="flex-grow-1" placeholder="/path/to/project" />
                    <Button icon="mdi mdi-folder-open" outlined @click="browseSource" />
                  </div>
                </div>
              </AccordionContent>
            </AccordionPanel>

            <!-- Packaging -->
            <AccordionPanel value="packaging" :disabled="!needsPackaging">
              <AccordionHeader>
                <div class="flex align-items-center gap-2">
                  <span>2. Packaging</span>
                  <span v-if="!needsPackaging" class="text-sm text-500 font-normal">(Not required for selected source)</span>
                </div>
              </AccordionHeader>
              <AccordionContent>
                <div class="flex align-items-center gap-2 mb-3">
                   <Checkbox v-model="doPackaging" binary inputId="doPackaging" />
                   <label for="doPackaging" class="cursor-pointer">Package project</label>
                </div>
                <div v-if="doPackaging" class="pl-4 border-left-1 border-300">
                    <p class="text-sm text-600">Packaging options will appear here.</p>
                </div>
              </AccordionContent>
            </AccordionPanel>

            <!-- Publishing -->
            <AccordionPanel value="publishing">
              <AccordionHeader>3. Publishing</AccordionHeader>
              <AccordionContent>
                <div class="flex flex-column gap-3">
                  <label class="font-semibold">Destinations</label>
                  
                  <!-- Steam -->
                  <div class="field-checkbox flex align-items-center gap-2">
                    <Checkbox v-model="publishingTargets" value="steam" inputId="steam" />
                    <label for="steam" class="cursor-pointer">Steam</label>
                  </div>
                  <div v-if="publishingTargets.includes('steam')" class="pl-4 mb-3">
                     <InputText v-model="steamAppId" placeholder="Steam App ID" class="w-full" />
                  </div>

                  <!-- Itch.io -->
                  <div class="field-checkbox flex align-items-center gap-2">
                    <Checkbox v-model="publishingTargets" value="itch" inputId="itch" />
                    <label for="itch" class="cursor-pointer">Itch.io</label>
                  </div>
                  <div v-if="publishingTargets.includes('itch')" class="pl-4 mb-3">
                     <InputText v-model="itchProject" placeholder="user/project" class="w-full" />
                  </div>

                  <!-- Poki -->
                  <div class="field-checkbox flex align-items-center gap-2">
                    <Checkbox v-model="publishingTargets" value="poki" inputId="poki" />
                    <label for="poki" class="cursor-pointer">Poki</label>
                  </div>
                   <div v-if="publishingTargets.includes('poki')" class="pl-4 mb-3">
                     <InputText v-model="pokiGameId" placeholder="Poki Game ID" class="w-full" />
                  </div>

                </div>
              </AccordionContent>
            </AccordionPanel>

          </Accordion>
        </div>

        <div class="pt-4 flex justify-content-end">
           <Button label="Run Pipeline" icon="mdi mdi-play" @click="runPipeline" />
        </div>

      </div>
    </Layout>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import RadioButton from 'primevue/radiobutton';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';

// Components are likely auto-imported, but referring to them helps type checking if set up.

const router = useRouter();

// --- Source ---
const sourceTypes = [
  { label: 'Construct 3 (HTML Export)', value: 'c3-html' },
  { label: 'Construct 3 (NW.js)', value: 'c3-nwjs' },
  { label: 'Godot', value: 'godot' },
  { label: 'Plain HTML', value: 'html' },
];
const selectedSourceType = ref('c3-html');
const sourcePath = ref('');

const browseSource = async () => {
  // Placeholder for file dialog logic
  console.log('Open file dialog');
};

// --- Packaging ---
const needsPackaging = computed(() => {
  // Example logic: NW.js is already packaged (mostly), others might need wrapping
  // Adjust logic as per actual requirement. 
  // User said: "(for example Construct 3 NW.js is already packaged)"
  return selectedSourceType.value !== 'c3-nwjs';
});

const doPackaging = ref(true);

// --- Publishing ---
const publishingTargets = ref<string[]>([]);
const steamAppId = ref('');
const itchProject = ref('');
const pokiGameId = ref('');

const runPipeline = () => {
  console.log({
    source: {
      type: selectedSourceType.value,
      path: sourcePath.value
    },
    packaging: needsPackaging.value ? doPackaging.value : false,
    publishing: {
      targets: publishingTargets.value,
      steam: steamAppId.value,
      itch: itchProject.value,
      poki: pokiGameId.value
    }
  });
  // Logic to trigger the pipeline would go here
};

</script>

<style scoped>
.simple-editor-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
