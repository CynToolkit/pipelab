<template>
  <nav class="runs-switch" aria-label="Runs and artifacts">
    <RouterLink :to="base" :aria-current="active === 'runs' ? 'page' : undefined">Runs</RouterLink>
    <RouterLink
      :to="`/workflows/${flowId}/${projectId}/artifacts`"
      :aria-current="active === 'artifacts' ? 'page' : undefined"
    >
      Artifacts
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

const props = defineProps<{ flowId: string; projectId: string; active: "runs" | "artifacts" }>();
const base = computed(() => `/workflows/${props.flowId}/${props.projectId}/runs`);
</script>

<style scoped>
.runs-switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--pl-sunken);
  border-radius: 10px;
}
.runs-switch a {
  padding: 5px 14px;
  color: var(--pl-muted);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  transition:
    color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.runs-switch a:hover {
  color: var(--p-text-color);
}
.runs-switch a[aria-current="page"] {
  color: var(--p-text-color);
  background: var(--p-content-background);
  box-shadow: var(--pl-shadow-xs);
  font-weight: 600;
}
.runs-switch a:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring);
}
</style>
