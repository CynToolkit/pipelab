<template>
  <div class="workflow-shell pl-workflow">
    <header class="workflow-header">
      <RouterLink to="/workflows" class="workflow-back" :aria-label="$t('home.back-to-workflows')">
        <i class="mdi mdi-arrow-left" aria-hidden="true" />{{ $t("home.workflows") }}
      </RouterLink>
      <div class="workflow-titlebar">
        <div class="workflow-identity">
          <div class="workflow-icon"><i class="mdi mdi-rocket-launch-outline" /></div>
          <div class="workflow-heading">
            <h1>{{ title || "Workflow" }}</h1>
            <p v-if="subtitle">{{ subtitle }}</p>
          </div>
        </div>
        <div class="workflow-actions"><slot name="actions" /></div>
      </div>
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
        <RouterLink :to="`${basePath}/plan`" :aria-current="active === 'plan' ? 'page' : undefined">
          <i class="mdi mdi-graph-outline" aria-hidden="true" />Plan
        </RouterLink>
        <RouterLink :to="`${basePath}/runs`" :aria-current="active === 'runs' ? 'page' : undefined">
          <i class="mdi mdi-history" aria-hidden="true" />Runs
        </RouterLink>
        <RouterLink
          :to="`${basePath}/settings`"
          :aria-current="active === 'settings' ? 'page' : undefined"
        >
          <i class="mdi mdi-cog-outline" aria-hidden="true" />Settings
        </RouterLink>
      </nav>
    </header>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

const props = defineProps<{
  flowId: string;
  projectId: string;
  title?: string;
  subtitle?: string;
  active: "configuration" | "builds" | "artifacts" | "plan" | "runs" | "settings";
}>();
const basePath = computed(() => `/workflows/${props.flowId}/${props.projectId}`);
</script>

<style scoped>
.workflow-shell {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 20px clamp(16px, 3vw, 40px) 64px;
  box-sizing: border-box;
}
.workflow-header {
  display: grid;
  gap: 14px;
  margin-bottom: 28px;
}
.workflow-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 3px 8px 3px 4px;
  margin-left: -4px;
  border-radius: 8px;
  color: var(--pl-muted);
  font-size: 0.8rem;
  font-weight: 500;
  text-decoration: none;
  transition:
    color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.workflow-back:hover {
  color: var(--p-text-color);
  background: var(--pl-hover);
}
.workflow-back:focus-visible,
.workflow-nav a:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring);
}
.workflow-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  flex-wrap: wrap;
}
.workflow-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.workflow-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  color: var(--pl-accent);
  background: linear-gradient(
    145deg,
    var(--pl-sunken),
    color-mix(in srgb, var(--p-text-color) 7%, var(--p-content-background))
  );
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  box-shadow: var(--pl-shadow-xs);
  font-size: 22px;
}
.workflow-heading {
  min-width: 0;
}
.workflow-heading h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.025em;
  overflow-wrap: anywhere;
}
.workflow-heading p {
  margin: 3px 0 0;
  color: var(--pl-muted);
  font-size: 0.84rem;
}
.workflow-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.workflow-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  border-bottom: 1px solid var(--pl-border);
  scrollbar-width: none;
}
.workflow-nav a {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: -1px;
  padding: 10px 14px;
  color: var(--pl-muted);
  border-radius: 8px 8px 0 0;
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 500;
  white-space: nowrap;
  transition:
    color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.workflow-nav a i {
  font-size: 1.05rem;
  opacity: 0.75;
}
.workflow-nav a:hover {
  color: var(--p-text-color);
  background: var(--pl-hover);
}
.workflow-nav a::after {
  content: "";
  position: absolute;
  right: 12px;
  bottom: 0;
  left: 12px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--pl-accent);
  transform: scaleX(0);
  transition: transform 0.2s var(--pl-ease);
}
.workflow-nav a[aria-current="page"] {
  color: var(--p-text-color);
  font-weight: 600;
}
.workflow-nav a[aria-current="page"] i {
  opacity: 1;
}
.workflow-nav a[aria-current="page"]::after {
  transform: scaleX(1);
}
@media (max-width: 640px) {
  .workflow-shell {
    padding: 14px 14px 40px;
  }
  .workflow-titlebar {
    align-items: flex-start;
  }
  .workflow-actions {
    justify-content: flex-start;
  }
  .workflow-nav a {
    flex: 0 0 auto;
    padding-inline: 10px;
  }
}
</style>
