<template>
  <div class="pipelines">
    <h2>Pipelines</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Status</th>
          <th>Steps</th>
          <th>Artifacts</th>
        </tr>
      </thead>
      <tbody>
        <Pipeline v-for="pipeline in pipelines" :key="pipeline.id" :pipeline="pipeline" />
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Pipeline from './Pipeline.vue'
import type { Pipeline as PipelineType } from '@@/types'
import { useAPI } from '@renderer/composables/api'

const { execute } = useAPI()

const pipelines = ref<PipelineType[]>([])

const response = await execute('builds:get')

if (response.type === 'success') {
  pipelines.value = response.result.builds
} else {
  throw new Error(response.ipcError)
}
</script>

<style scoped>
.pipelines {
  width: 100%;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  border: 1px solid #ddd;
  padding: 8px;
}

th {
  background-color: #f2f2f2;
  text-align: left;
}
</style>