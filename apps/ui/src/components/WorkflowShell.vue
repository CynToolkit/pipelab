<template>
  <div class="workflow-shell">
    <header class="workflow-header">
      <div class="workflow-identity">
        <Button
          text
          rounded
          icon="mdi mdi-arrow-left"
          aria-label="Back to workflows"
          @click="router.push('/dashboard')"
        />
        <div class="workflow-icon"><i class="mdi mdi-rocket-launch-outline" /></div>
        <div class="workflow-heading">
          <span class="eyebrow">Workflow</span>
          <h1>{{ title || "Workflow" }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="workflow-actions"><slot name="actions" /></div>
      <nav class="workflow-nav" aria-label="Workflow navigation">
        <RouterLink :to="basePath" :aria-current="active === 'configuration' ? 'page' : undefined">
          <i class="mdi mdi-tune-variant" aria-hidden="true" />Configuration
        </RouterLink>
        <RouterLink
          :to="`${basePath}/builds`"
          :aria-current="active === 'builds' ? 'page' : undefined"
        >
          <i class="mdi mdi-hammer-wrench" aria-hidden="true" />Builds
        </RouterLink>
        <RouterLink
          :to="`${basePath}/artifacts`"
          :aria-current="active === 'artifacts' ? 'page' : undefined"
        >
          <i class="mdi mdi-package-variant-closed" aria-hidden="true" />Artifacts
        </RouterLink>
        <RouterLink :to="`${basePath}/runs`" :aria-current="active === 'runs' ? 'page' : undefined">
          <i class="mdi mdi-history" aria-hidden="true" />Runs
        </RouterLink>
      </nav>
    </header>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import Button from "primevue/button";

const props = defineProps<{
  flowId: string;
  projectId: string;
  title?: string;
  subtitle?: string;
  active: "configuration" | "builds" | "artifacts" | "runs";
}>();
const router = useRouter();
const basePath = computed(() => `/workflows/${props.flowId}/${props.projectId}`);
</script>

<style scoped>
.workflow-shell {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px clamp(16px, 2.5vw, 32px) 48px;
  box-sizing: border-box;
}
.workflow-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 20px;
  margin-bottom: 24px;
}
.workflow-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.workflow-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  color: var(--primary-color);
  background: var(--p-surface-100, var(--surface-ground));
  border-radius: 8px;
  font-size: 20px;
}
.workflow-heading {
  min-width: 0;
}
.workflow-heading .eyebrow {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.workflow-heading h1 {
  margin: 1px 0 0;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.workflow-heading p {
  margin: 2px 0 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.workflow-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.workflow-nav {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
}
.workflow-nav a {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: -1px;
  padding: 10px 12px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  border-bottom: 2px solid transparent;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}
.workflow-nav a:hover {
  color: var(--text-color);
  background: var(--p-surface-50, var(--surface-ground));
}
.workflow-nav a:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
  box-shadow:
    0 0 0 2px var(--surface-ground, #fff),
    0 0 0 4px var(--primary-color);
  border-radius: 4px;
}
.workflow-nav a[aria-current="page"] {
  color: var(--text-color);
  border-bottom-color: var(--primary-color);
}
:root.dark .workflow-icon {
  background: var(--p-surface-800, #27272a);
}
:root.dark .workflow-nav {
  border-color: var(--p-surface-700, #3f3f46);
}
:root.dark .workflow-nav a:hover {
  background: var(--p-surface-800, #27272a);
}
:root.dark .workflow-nav a:focus-visible {
  box-shadow:
    0 0 0 2px var(--p-surface-900, #18181b),
    0 0 0 4px var(--p-primary-400, #818cf8);
}
@media (max-width: 640px) {
  .workflow-shell {
    padding: 18px 12px 36px;
  }
  .workflow-header {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .workflow-identity {
    gap: 8px;
  }
  .workflow-actions {
    grid-column: 1;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .workflow-actions :deep(.p-select) {
    min-width: 0;
  }
  .workflow-nav a {
    flex: 0 0 auto;
    justify-content: center;
    padding-inline: 8px;
  }
}
</style>
