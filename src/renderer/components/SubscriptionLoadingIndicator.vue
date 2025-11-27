<template>
  <div class="subscription-loading-indicator">
    <div class="spinner" :class="size"></div>
    <span v-if="showText" class="message">{{ message }}</span>
  </div>
</template>

<script lang="ts" setup>
interface Props {
  message?: string
  size?: 'small' | 'medium' | 'large'
  showText?: boolean
}

withDefaults(defineProps<Props>(), {
  message: 'Loading...',
  size: 'small',
  showText: true
})
</script>

<style lang="scss" scoped>
.subscription-loading-indicator {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  font-size: 1rem;
  color: white;
}

.spinner {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  &.small {
    width: 20px;
    height: 20px;
  }

  &.medium {
    width: 30px;
    height: 30px;
  }

  &.large {
    width: 40px;
    height: 40px;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.message {
  margin-top: 24px;
  font-weight: 500;
  text-align: center;
}
</style>