<template>
  <div class="os-card">
    <div class="flex align-items-center mb-4">
      <span class="text-4xl mr-2">
        <Icon height="22" :icon="getOsIcon(os)" /></span>
      <h2 class="text-2xl font-semibold">{{ os }}</h2>
    </div>
    <div
      v-for="option in options"
      :key="option.value"
      class="flex justify-content-between align-items-center mb-2"
    >
      <span>{{ option.label }}</span>
      <Button :disabled="!option.value" as="a" :href="option.value" icon="pi pi-download" text rounded class="p-button-sm primary-btn" />
    </div>
  </div>
</template>

<script setup>
import { defineProps } from "vue";
import Button from "primevue/button";
import { Icon } from '@iconify/vue';

const props = defineProps({
  os: String,
  options: Array,
});

const getOsIcon = (os) => {
  switch (os) {
    case "macOS":
      return "simple-icons:apple";
    case "Windows":
      return "simple-icons:windows10";
    case "Linux":
      return "simple-icons:linux";
    default:
      return "";
  }
};
</script>

<style lang="scss" scoped>
.os-card {
  background-color: #fff;
  border-radius: 16px;
  padding: 1rem 1rem;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: relative;
  border: 1px solid #f1f1f1;
  width: 300px;
}

a {
  text-decoration: none;
}
</style>