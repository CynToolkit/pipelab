<template>
  <li class="pipeline-step">
    <div class="step-header" @click="toggleLogs">
      <span>{{ step.name }}</span>
      <span>{{ step.status }}</span>
    </div>
    <div v-if="step.artifacts && step.artifacts.length > 0" class="artifacts">
      <strong>Artifacts:</strong>
      <ul>
        <PipelineStepArtifact v-for="artifact in step.artifacts" :key="artifact.id" :artifact="artifact" />
      </ul>
    </div>
    <PipelineStepLog v-if="showLogs" :log="step.logs" />
  </li>
</template>

<script setup lang="ts">
import { defineProps, ref } from 'vue'
import type { PipelineStep } from '@@/types'
import PipelineStepLog from './PipelineStepLog.vue'
import PipelineStepArtifact from './PipelineStepArtifact.vue'

const props = defineProps({
  step: {
    type: Object as () => PipelineStep,
    required: true
  }
})

const showLogs = ref(false)

const toggleLogs = () => {
  showLogs.value = !showLogs.value
}
</script>

<style scoped>
.pipeline-step {
  padding: 4px 0;
}

.step-header {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.step-header:hover {
  background-color: #f0f0f0;
}
</style>