<template>
  <button v-if="!isSubscribed" class="upgrade-now-button" @click="openUpgradeDialog">
    <i class="mdi mdi-crown upgrade-icon"></i>
    Upgrade now
  </button>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useAuth } from '@renderer/store/auth'

const authStore = useAuth()

// Check if user has any active subscriptions
const isSubscribed = computed(() => {
  return authStore.subscriptions.length > 0
})

const emit = defineEmits(['open-upgrade-dialog'])

const openUpgradeDialog = () => {
  emit('open-upgrade-dialog')
}
</script>

<style lang="scss" scoped>
.upgrade-now-button {
  background-color: #6366f1; /* Indigo color for upgrade button */
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background-color: #5856eb;
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
  }

  .upgrade-icon {
    font-size: 16px;
    margin-right: 4px;
  }
}
</style>
