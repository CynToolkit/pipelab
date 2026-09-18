<template>
  <router-link
    :to="to"
    class="platform-badge"
    :class="[size, { 'with-icon': hasIcon }]">
    <span v-if="hasIcon" class="badge-icon">
      <slot name="icon"></slot>
    </span>
    <span class="badge-text">
      <slot>{{ text }}</slot>
    </span>
  </router-link>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps({
  to: {
    type: Object,
    required: true
  },
  text: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'medium',
    validator: (value: string) => ['small', 'medium', 'large'].includes(value)
  }
});

const hasIcon = computed(() => !!props.text);
</script>

<style lang="scss" scoped>
.platform-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--surface-ground);
  color: var(--text-color);
  border-radius: 20px;
  padding: 6px 12px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  border: 1px solid var(--surface-border);
  margin: 0 4px;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 2px;
    height: 100%;
    background: var(--primary-color);
    opacity: 0.15;
    transition: all 0.2s ease;
  }

  &:hover {
    background-color: var(--surface-hover);
    border-color: var(--primary-color);
    border-width: 1.5px;

    &::before {
      opacity: 0.3;
      width: 3px;
    }
  }

  &.small {
    padding: 4px 8px;
    font-size: 0.8rem;
  }

  &.medium {
    padding: 6px 12px;
    font-size: 0.9rem;
  }

  &.large {
    padding: 8px 16px;
    font-size: 1rem;
  }

  &.with-icon {
    padding-left: 8px;
  }
}

.badge-icon {
  margin-right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge-icon :deep(svg) {
  width: 1em;
  height: 1em;
  color: var(--text-color);
  transition: color 0.2s ease;
}

.platform-badge:hover .badge-icon :deep(svg) {
  color: var(--primary-color);
}

.badge-text {
  white-space: nowrap;
  position: relative;
  z-index: 1;
}
</style>