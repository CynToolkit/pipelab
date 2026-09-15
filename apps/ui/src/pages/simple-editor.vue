<template>
  <div class="simple-editor-page">
    <Layout>
      <div class="p-4 h-full flex flex-column overflow-hidden">
        <div class="flex justify-content-between align-items-center mb-4">
          <div>
            <h1 class="text-xl m-0 font-bold">Workflow</h1>
            <p class="text-sm text-500 mt-2 mb-0">Ship a game through the new workflow runtime.</p>
          </div>
          <Button
            outlined
            label="Close"
            icon="mdi mdi-close"
            size="small"
            @click="router.push('/')"
          />
        </div>

        <Message v-if="runState === 'error'" severity="error" :closable="false" class="mb-3">
          {{ runError }}
        </Message>
        <Message v-if="runState === 'cancelled'" severity="warn" :closable="false" class="mb-3">
          Workflow cancelled.
        </Message>

        <div class="flex-grow-1 overflow-y-auto">
          <Accordion :value="['source', 'packaging', 'publishing']" multiple>
            <AccordionPanel value="source">
              <AccordionHeader>1. Source Selection</AccordionHeader>
              <AccordionContent>
                <div class="flex flex-column gap-3">
                  <label class="font-semibold">Project Type</label>
                  <div class="flex flex-wrap gap-3">
                    <div
                      v-for="type in sourceTypes"
                      :key="type.value"
                      class="flex align-items-center"
                    >
                      <RadioButton
                        v-model="selectedSourceType"
                        :inputId="type.value"
                        :value="type.value"
                        :disabled="isRunning"
                      />
                      <label :for="type.value" class="ml-2 cursor-pointer">{{ type.label }}</label>
                    </div>
                  </div>

                  <label class="font-semibold mt-2">Source Path</label>
                  <div class="flex gap-2">
                    <InputText
                      v-model="sourcePath"
                      class="flex-grow-1"
                      placeholder="Select a Construct source"
                      :disabled="isRunning"
                    />
                    <Button
                      icon="mdi mdi-folder-open"
                      outlined
                      :disabled="isRunning"
                      @click="browseSource"
                    />
                  </div>
                  <small class="text-500">
                    {{
                      selectedSourceType === "c3p"
                        ? "Choose a Construct 3 .c3p file."
                        : "Choose an exported Construct 3 project folder."
                    }}
                  </small>
                </div>
              </AccordionContent>
            </AccordionPanel>

            <AccordionPanel value="packaging">
              <AccordionHeader>2. Packaging</AccordionHeader>
              <AccordionContent>
                <div class="flex align-items-center gap-2 mb-3">
                  <Checkbox
                    v-model="doPackaging"
                    binary
                    inputId="doPackaging"
                    :disabled="isRunning"
                  />
                  <label for="doPackaging" class="cursor-pointer">Bundle with Electron</label>
                </div>
                <p class="text-sm text-600 m-0">
                  Exported source is extracted first, then passed to the current Electron bundler.
                </p>
              </AccordionContent>
            </AccordionPanel>

            <AccordionPanel value="publishing">
              <AccordionHeader>3. Publishing</AccordionHeader>
              <AccordionContent>
                <div class="flex flex-column gap-3">
                  <label class="font-semibold">Destinations</label>

                  <div class="field-checkbox flex align-items-center gap-2">
                    <Checkbox
                      v-model="publishingTargets"
                      value="steam"
                      inputId="steam"
                      :disabled="isRunning || !doPackaging"
                    />
                    <label for="steam" class="cursor-pointer">Steam</label>
                  </div>
                  <div
                    v-if="publishingTargets.includes('steam')"
                    class="pl-4 flex flex-column gap-2"
                  >
                    <InputText
                      v-model="steamSdk"
                      placeholder="Steam SDK folder"
                      :disabled="isRunning"
                    />
                    <InputText
                      v-model="steamUsername"
                      placeholder="Steam username"
                      :disabled="isRunning"
                    />
                    <InputText
                      v-model="steamAppId"
                      placeholder="Steam App ID"
                      :disabled="isRunning"
                    />
                    <InputText
                      v-model="steamDepotId"
                      placeholder="Steam Depot ID"
                      :disabled="isRunning"
                    />
                    <InputText
                      v-model="steamDescription"
                      placeholder="Build description"
                      :disabled="isRunning"
                    />
                  </div>

                  <div class="field-checkbox flex align-items-center gap-2 mt-2">
                    <Checkbox
                      v-model="publishingTargets"
                      value="itch"
                      inputId="itch"
                      :disabled="isRunning || !doPackaging"
                    />
                    <label for="itch" class="cursor-pointer">Itch.io</label>
                  </div>
                  <div
                    v-if="publishingTargets.includes('itch')"
                    class="pl-4 flex flex-column gap-2"
                  >
                    <InputText
                      v-model="itchProject"
                      placeholder="user/project"
                      :disabled="isRunning"
                    />
                    <InputText
                      v-model="itchChannel"
                      placeholder="Channel (e.g. windows)"
                      :disabled="isRunning"
                    />
                    <InputText
                      v-model="itchApiKey"
                      type="password"
                      placeholder="Butler API key"
                      :disabled="isRunning"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionPanel>
          </Accordion>

          <section v-if="runSteps.length > 0" class="run-panel mt-4">
            <div class="flex justify-content-between align-items-center mb-3">
              <div>
                <h2 class="text-lg m-0">Run status</h2>
                <span class="text-sm text-500">{{ runStateLabel }}</span>
              </div>
              <span v-if="currentStep" class="text-sm font-semibold"
                >Current: {{ currentStep }}</span
              >
            </div>

            <div class="flex flex-column gap-2 mb-4">
              <div
                v-for="step in runSteps"
                :key="step.id"
                class="step-row flex align-items-center gap-2"
              >
                <i :class="stepIcon(step.status)" />
                <span>{{ step.label }}</span>
                <span class="text-sm text-500 ml-auto">{{ step.status }}</span>
              </div>
            </div>

            <h3 class="text-base mb-2">Logs</h3>
            <pre class="workflow-log">{{
              logs.join("\n") || "Logs will appear here when the workflow starts."
            }}</pre>
          </section>
        </div>

        <div class="pt-4 flex justify-content-end gap-2">
          <Button
            v-if="isRunning"
            label="Cancel"
            icon="mdi mdi-stop"
            severity="danger"
            outlined
            @click="cancelPipeline"
          />
          <Button
            v-else
            label="Run Workflow"
            icon="mdi mdi-play"
            :disabled="!sourcePath"
            @click="runPipeline"
          />
        </div>
      </div>
    </Layout>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";
import RadioButton from "primevue/radiobutton";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import Button from "primevue/button";
import Message from "primevue/message";
import { Events } from "@pipelab/shared";
import { useAPI } from "@renderer/composables/api";
import Layout from "../components/Layout.vue";
import {
  createWorkflowDefinition,
  type WorkflowDefinition,
  type WorkflowSourceType,
  type WorkflowTargetOptions,
} from "../utils/workflow-definition";

type RunState = "idle" | "running" | "success" | "error" | "cancelled";
type StepStatus = "pending" | "running" | "done" | "error";
type RunStep = { id: string; label: string; status: StepStatus };

const router = useRouter();
const api = useAPI();
const toast = useToast();

const sourceTypes: Array<{ label: string; value: WorkflowSourceType }> = [
  { label: "Construct 3 (.c3p)", value: "c3p" },
  { label: "Construct 3 project folder", value: "folder" },
];
const selectedSourceType = ref<WorkflowSourceType>("c3p");
const sourcePath = ref("");
const doPackaging = ref(true);
const publishingTargets = ref<string[]>([]);
const steamSdk = ref("");
const steamUsername = ref("");
const steamAppId = ref("");
const steamDepotId = ref("");
const steamDescription = ref("");
const itchProject = ref("");
const itchChannel = ref("windows");
const itchApiKey = ref("");
const isRunning = ref(false);
const runState = ref<RunState>("idle");
const runError = ref("");
const currentStep = ref("");
const logs = ref<string[]>([]);
const runSteps = ref<RunStep[]>([]);

const runStateLabel = computed(() => {
  switch (runState.value) {
    case "running":
      return "Running";
    case "success":
      return "Completed successfully";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Ready";
  }
});

const stepLabels: Record<string, string> = {
  "source-export": "Source export",
  prebundle: "Pre-bundling",
  bundle: "Electron bundle",
  steam: "Steam upload",
  itch: "Itch.io upload",
};

const stepIcon = (status: StepStatus) => {
  if (status === "running") return "mdi mdi-loading mdi-spin text-primary";
  if (status === "done") return "mdi mdi-check-circle text-green-500";
  if (status === "error") return "mdi mdi-alert-circle text-red-500";
  return "mdi mdi-circle-outline text-500";
};

const browseSource = async () => {
  const result = await api.execute("dialog:showOpenDialog", {
    title: "Select a Construct source",
    properties: selectedSourceType.value === "c3p" ? ["openFile"] : ["openDirectory"],
    ...(selectedSourceType.value === "c3p"
      ? { filters: [{ name: "Construct Project", extensions: ["c3p"] }] }
      : {}),
  });

  if (result.type === "success" && !result.result.canceled) {
    sourcePath.value = result.result.filePaths[0] ?? "";
  }
};

const createTargets = (): WorkflowTargetOptions => {
  const targets: WorkflowTargetOptions = {};
  if (publishingTargets.value.includes("steam")) {
    targets.steam = {
      sdk: steamSdk.value,
      username: steamUsername.value,
      appId: steamAppId.value,
      depotId: steamDepotId.value,
      description: steamDescription.value,
    };
  }
  if (publishingTargets.value.includes("itch")) {
    targets.itch = {
      project: itchProject.value,
      apiKey: itchApiKey.value,
      channel: itchChannel.value,
    };
  }
  return targets;
};

const appendLog = (stepId: string, message: string) => {
  logs.value.push(`[${stepLabels[stepId] ?? stepId}] ${message}`);
};

const onWorkflowEvent = async (message: Events<"workflow:execute">) => {
  if (message.type !== "workflow-event") return;
  const event = message.data;

  if (event.type === "step.started") {
    currentStep.value = stepLabels[event.stepId] ?? event.stepId;
    const step = runSteps.value.find((candidate) => candidate.id === event.stepId);
    if (step) step.status = "running";
  } else if (event.type === "step.log") {
    appendLog(event.stepId, event.message);
  } else if (event.type === "step.completed") {
    const step = runSteps.value.find((candidate) => candidate.id === event.stepId);
    if (step) step.status = "done";
  } else if (event.type === "step.failed") {
    const step = runSteps.value.find((candidate) => candidate.id === event.stepId);
    if (step) step.status = "error";
    appendLog(event.stepId, event.error.message);
  } else if (event.type === "workflow.completed") {
    currentStep.value = "";
  } else if (event.type === "workflow.failed") {
    runError.value = event.error.message;
  }
};

const runPipeline = async () => {
  if (isRunning.value || !sourcePath.value) return;

  const targets = createTargets();
  if (targets.itch && (!targets.itch.project || !targets.itch.apiKey)) {
    toast.add({
      severity: "error",
      summary: "Itch.io settings required",
      detail: "Enter a project and Butler API key.",
      life: 5000,
    });
    return;
  }
  if (targets.steam && (!targets.steam.sdk || !targets.steam.appId || !targets.steam.depotId)) {
    toast.add({
      severity: "error",
      summary: "Steam settings required",
      detail: "Enter the SDK, App ID, and Depot ID.",
      life: 5000,
    });
    return;
  }

  const workflow: WorkflowDefinition = createWorkflowDefinition({
    sourceType: selectedSourceType.value,
    packageProject: doPackaging.value,
    targets,
  });
  runSteps.value = workflow.steps.map((step) => ({
    id: step.id,
    label: stepLabels[step.id] ?? step.id,
    status: "pending",
  }));
  logs.value = [];
  runError.value = "";
  runState.value = "running";
  isRunning.value = true;

  try {
    const result = await api.execute(
      "workflow:execute",
      { workflow, variables: { sourcePath: sourcePath.value } },
      onWorkflowEvent,
    );

    if (result.type === "success") {
      runState.value = "success";
      toast.add({
        severity: "success",
        summary: "Workflow complete",
        detail: "The workflow finished successfully.",
        life: 5000,
      });
    } else {
      runState.value = result.code === "canceled" ? "cancelled" : "error";
      runError.value = result.ipcError;
    }
  } catch (error) {
    runState.value = "error";
    runError.value = error instanceof Error ? error.message : "Workflow execution failed";
  } finally {
    isRunning.value = false;
    currentStep.value = "";
  }
};

const cancelPipeline = async () => {
  await api.execute("workflow:cancel");
};
</script>

<style scoped>
.simple-editor-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.run-panel {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 1rem;
}

.step-row {
  min-height: 2rem;
}

.workflow-log {
  min-height: 10rem;
  max-height: 20rem;
  overflow: auto;
  padding: 1rem;
  border-radius: 6px;
  background: var(--surface-ground);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
