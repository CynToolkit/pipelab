<template>
  <li class="pipeline-step-artifact">
    <a :href="artifact.url" target="_blank" rel="noopener noreferrer">
      {{ artifact.name }}
    </a>
  </li>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'
import type { PipelineArtifact } from '@@/types'

const props = defineProps({
  artifact: {
    type: Object as () => PipelineArtifact,
    required: true
  }
})
</script>

<style scoped>
.pipeline-step-artifact a {
  color: #007bff;
  text-decoration: none;
}

.pipeline-step-artifact a:hover {
  text-decoration: underline;
}
</style>