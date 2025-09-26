<template>
  <div class="pipeline-step-log">
    <pre>{{ log }}</pre>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps({
  log: {
    type: String,
    required: true
  }
})
</script>

<style scoped>
.pipeline-step-log {
  background-color: #333;
  color: #fff;
  padding: 10px;
  border-radius: 4px;
  margin-top: 8px;
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>