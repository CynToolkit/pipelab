<template>
  <div class="node-action">
    <div class="title">
      <span class="pi pi-play"></span>

      <span class="ml-2">{{ title }}</span>
    </div>
    <div class="subtitle">
      {{ subtitle }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    required: false,
    default: ''
  }
})
</script>

<style scoped>
.condition-branches {
  display: flex;
}

.node-action {
  border: 1px solid #c2c9d1;
  padding: 16px;
  border-radius: 4px;
  width: fit-content;
  background-color: white;

  &.active {
    outline: 1px solid red;
    outline-offset: 3px;
  }
}
</style>
