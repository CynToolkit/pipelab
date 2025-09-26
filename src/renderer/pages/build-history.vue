<template>
  <div class="build-history">
    <h1>Build History</h1>
    <div v-if="error" class="error">
      <p>Failed to load build history: {{ error.message }}</p>
    </div>
    <Suspense v-else>
      <Pipelines />
      <template #fallback>
        <p>Loading pipelines...</p>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import Pipelines from '@renderer/components/Pipelines.vue'

const error = ref<Error | null>(null)

onErrorCaptured((err) => {
  error.value = err
  return true
})
</script>

<style scoped>
.build-history {
  padding: 20px;
}

.error {
  color: #d32f2f;
  background-color: #ffcdd2;
  padding: 1rem;
  border-radius: 4px;
}
</style>