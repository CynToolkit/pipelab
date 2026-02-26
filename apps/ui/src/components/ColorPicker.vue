<template>
  <input
    type="color"
    :value="modelValue"
    class="color-picker"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>

<style scoped>
.color-picker {
  width: 100%;
  height: 40px;
  border: 1px solid #bdbdbd;
  border-radius: 4px;
  cursor: pointer;
}
</style>
