<template>
  <tr class="pipeline">
    <td>{{ pipeline.id }}</td>
    <td>{{ pipeline.status }}</td>
    <td>
      <ul>
        <PipelineStep v-for="step in pipeline.steps" :key="step.id" :step="step" />
      </ul>
    </td>
    <td>
      <ul>
        <PipelineStepArtifact v-for="artifact in pipeline.artifacts" :key="artifact.id" :artifact="artifact" />
      </ul>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'
import PipelineStep from './PipelineStep.vue'
import PipelineStepArtifact from './PipelineStepArtifact.vue'
import type { Pipeline } from '@@/types'

const props = defineProps({
  pipeline: {
    type: Object as () => Pipeline,
    required: true
  }
})
</script>

<style scoped>
.pipeline {
  /* Add your styles here */
}
</style>