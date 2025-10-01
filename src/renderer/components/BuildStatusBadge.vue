<template>
  <span v-tooltip.top="tooltipText" class="build-status-badge" :class="statusClass">
    <i :class="statusIcon" class="status-icon"></i>
    {{ statusText }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BuildHistoryEntry } from '@@/build-history'

interface Props {
  status: BuildHistoryEntry['status'] | 'pending'
  showIcon?: boolean
  size?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<Props>(), {
  showIcon: true,
  size: 'medium'
})

const statusConfig = {
  running: {
    class: 'status-running',
    icon: 'pi pi-spin pi-spinner',
    text: 'Running',
    color: '#007bff',
    tooltip: 'Build is currently in progress'
  },
  completed: {
    class: 'status-completed',
    icon: 'pi pi-check',
    text: 'Completed',
    color: '#28a745',
    tooltip: 'Build completed successfully'
  },
  failed: {
    class: 'status-failed',
    icon: 'pi pi-times',
    text: 'Failed',
    color: '#dc3545',
    tooltip: 'Build failed with errors'
  },
  cancelled: {
    class: 'status-cancelled',
    icon: 'pi pi-stop',
    text: 'Cancelled',
    color: '#6c757d',
    tooltip: 'Build was cancelled'
  },
  pending: {
    class: 'status-pending',
    icon: 'pi pi-clock',
    text: 'Pending',
    color: '#ffc107',
    tooltip: 'Step is waiting to execute'
  }
}

const statusClass = computed(() => {
  const config = statusConfig[props.status]
  return [
    'build-status-badge',
    `status-${props.status}`,
    `size-${props.size}`,
    config?.class
  ].filter(Boolean)
})

const statusIcon = computed(() => {
  if (!props.showIcon) return ''
  return statusConfig[props.status]?.icon || ''
})

const statusText = computed(() => {
  return statusConfig[props.status]?.text || props.status
})

const tooltipText = computed(() => {
  return statusConfig[props.status]?.tooltip || props.status
})
</script>

<style scoped>
.build-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.size-small {
  padding: 2px 6px;
  font-size: 0.625rem;
}

.size-large {
  padding: 6px 12px;
  font-size: 0.875rem;
}

.status-icon {
  font-size: 0.875em;
}

/* Status Colors */
.status-running {
  background-color: rgba(0, 123, 255, 0.1);
  color: #007bff;
  border: 1px solid rgba(0, 123, 255, 0.2);
}

.status-completed {
  background-color: rgba(40, 167, 69, 0.1);
  color: #28a745;
  border: 1px solid rgba(40, 167, 69, 0.2);
}

.status-failed {
  background-color: rgba(220, 53, 69, 0.1);
  color: #dc3545;
  border: 1px solid rgba(220, 53, 69, 0.2);
}

.status-cancelled {
  background-color: rgba(108, 117, 125, 0.1);
  color: #6c757d;
  border: 1px solid rgba(108, 117, 125, 0.2);
}

.status-pending {
  background-color: rgba(255, 193, 7, 0.1);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.2);
}

/* Hover Effects */
.build-status-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Pulse animation for running status */
.status-running {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 1;
  }
}
</style>
