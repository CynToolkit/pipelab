<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
type Source = "construct" | "folder" | "";
type Destination = "Steam" | "itch.io";
const labels = [
  "Name & description",
  "Source & project path",
  "Destinations",
  "Recap",
];
const sourceLabels: Record<Exclude<Source, "">, string> = {
  construct: "Construct project",
  folder: "Folder",
};
const step = ref(0);
const name = ref("");
const description = ref("");
const source = ref<Source>("");
const path = ref("");
const destinations = ref<Destination[]>([]);
const complete = ref(false);
const heading = ref<HTMLElement | null>(null);
const valid = computed(() => [
  Boolean(name.value.trim()),
  Boolean(source.value && path.value.trim()),
  destinations.value.length > 0,
]);
const canAdvance = computed(() => step.value < 3 && valid.value[step.value]);
const maxStep = computed(() =>
  valid.value[0] ? (valid.value[1] ? (valid.value[2] ? 3 : 2) : 1) : 0
);
function move(target: number) {
  if (target < 0 || target > maxStep.value || complete.value) return;
  step.value = target;
  nextTick(() => heading.value?.focus());
}
function chooseSource(value: Source) {
  if (source.value !== value) path.value = "";
  source.value = value;
}
function toggleDestination(value: Destination) {
  destinations.value = destinations.value.includes(value)
    ? destinations.value.filter((item) => item !== value)
    : [...destinations.value, value];
}
function finish() {
  complete.value = true;
  nextTick(() => heading.value?.focus());
}
function restart() {
  name.value = "";
  description.value = "";
  source.value = "";
  path.value = "";
  destinations.value = [];
  complete.value = false;
  step.value = 0;
  nextTick(() => heading.value?.focus());
}
</script>
<template>
  <div class="wizard" aria-label="Try an example release workflow">
    <div class="wizard-chrome">
      <span class="chrome-dots" aria-hidden="true">● ● ●</span
      ><img
        class="wizard-brand"
        src="/banner.png"
        alt="Pipelab"
        width="98"
        height="25"
      /><span class="demo-label">Interactive example</span>
    </div>
    <div class="wizard-layout">
      <nav class="wizard-steps" aria-label="Example workflow steps">
        <ol>
          <li v-for="(label, index) in labels" :key="label">
            <button
              type="button"
              :disabled="complete || index > maxStep"
              :aria-current="step === index && !complete ? 'step' : undefined"
              @click="move(index)"
            >
              <span class="step-number">{{ index + 1 }}</span
              ><span>{{ label }}</span>
            </button>
          </li>
        </ol>
      </nav>
      <div class="wizard-content">
        <template v-if="!complete"
          ><div :key="step" class="wizard-panel">
            <h2 ref="heading" tabindex="-1">
              {{ step + 1 }}. {{ labels[step] }}
            </h2>
            <template v-if="step === 0"
              ><p>Give your example release a name.</p>
              <label for="example-name"
                >Name <span aria-hidden="true">*</span></label
              ><input
                id="example-name"
                v-model="name"
                autocomplete="off"
                required
                placeholder="My game"
              /><label for="example-description"
                >Description <span class="optional">(optional)</span></label
              ><textarea
                id="example-description"
                v-model="description"
                rows="2"
                placeholder="A note about this release"
              />
            </template>
            <template v-else-if="step === 1"
              ><p>Choose the project this release represents.</p>
              <div class="choice-row">
                <button
                  type="button"
                  :aria-pressed="source === 'construct'"
                  @click="chooseSource('construct')"
                >
                  Construct project <small>.c3p file</small></button
                ><button
                  type="button"
                  :aria-pressed="source === 'folder'"
                  @click="chooseSource('folder')"
                >
                  Folder <small>Game files</small>
                </button>
              </div>
              <label for="example-path"
                >{{
                  source === "construct"
                    ? "Example project file path"
                    : "Example project path"
                }}
                <span aria-hidden="true">*</span></label
              ><input
                id="example-path"
                v-model="path"
                :disabled="!source"
                required
                :placeholder="
                  source === 'construct'
                    ? '/Games/MyGame/MyGame.c3p'
                    : '/Games/MyGame'
                "
              /><small class="field-note"
                >Type an example path. This demo cannot access your
                files.</small
              ></template
            >
            <template v-else-if="step === 2"
              ><p>
                Choose at least one store. You’ll connect your account later in
                the app.
              </p>
              <div class="choice-row stores">
                <button
                  v-for="store in (['Steam', 'itch.io'] as Destination[])"
                  :key="store"
                  type="button"
                  :aria-pressed="destinations.includes(store)"
                  @click="toggleDestination(store)"
                >
                  {{ store }}
                </button>
              </div></template
            >
            <template v-else
              ><p>
                Review your example. Builds, connections and store details are
                configured later in the app.
              </p>
              <dl class="recap">
                <div>
                  <dt>Name</dt>
                  <dd>{{ name.trim() }}</dd>
                </div>
                <div v-if="description.trim()">
                  <dt>Description</dt>
                  <dd>{{ description.trim() }}</dd>
                </div>
                <div>
                  <dt>Project</dt>
                  <dd>{{ source ? sourceLabels[source] : "" }}</dd>
                </div>
                <div>
                  <dt>Example path</dt>
                  <dd>{{ path.trim() }}</dd>
                </div>
                <div>
                  <dt>Stores</dt>
                  <dd>{{ destinations.join(", ") }}</dd>
                </div>
              </dl></template
            >
          </div>
          <div class="wizard-actions">
            <button
              v-if="step > 0"
              type="button"
              class="back"
              @click="move(step - 1)"
            >
              Back</button
            ><button
              v-if="step < 3"
              type="button"
              class="next"
              :disabled="!canAdvance"
              @click="move(step + 1)"
            >
              Continue <span aria-hidden="true">→</span></button
            ><button v-else type="button" class="next" @click="finish">
              Create example workflow
            </button>
          </div></template
        >
        <div v-else class="wizard-panel completion" role="status">
          <h2 ref="heading" tabindex="-1">Example workflow created</h2>
          <p>This was an example only. Nothing was saved, built or uploaded.</p>
          <p>
            In Pipelab, configure builds and store connections after creating a
            workflow.
          </p>
          <button type="button" class="next" @click="restart">
            Start again
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./ExampleWizard.css"></style>
