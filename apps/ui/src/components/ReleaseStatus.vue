<template>
  <span
    v-if="kind === 'problem'"
    v-tooltip.top="label"
    class="release-status-dot"
    role="img"
    :aria-label="label"
  />
  <span v-else-if="kind === 'ready'" class="release-status-ready">{{ label }}</span>
  <span v-else class="release-status-note">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * Quiet readiness indicator: a dot for things that need work, nothing visible for "Ready", and
 * muted text for neutral states such as "Disabled". The label stays available to assistive tech.
 */
const props = defineProps<{ label: string }>();
const kind = computed(() =>
  props.label === "Ready"
    ? "ready"
    : props.label === "Needs attention" || props.label === "Output required"
      ? "problem"
      : "neutral",
);
</script>

<style scoped>
.release-status-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--p-orange-500, #f97316);
}
.release-status-ready {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.release-status-note {
  flex: 0 0 auto;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
}
</style>
