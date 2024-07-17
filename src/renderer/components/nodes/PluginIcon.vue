<template>
  <div v-if="!icon" :style="{ width }"></div>
  <img
    v-else-if="icon.type === 'image'"
    :style="{ width: width }"
    :src="icon.image"
  />
  <i
    v-else-if="icon.type === 'icon'"
    :style="{ 'font-size': width, width, display: 'flex', color }"
    :class="{ 'node-icon': true, mdi: true, [icon.icon]: true }"
  />
</template>

<script lang="ts" setup>
import { IconType } from '@cyn/plugin-core';
import { PropType } from 'vue';

defineProps({
  icon: {
    type: Object as PropType<IconType | undefined>,
    required: true,
  },
  width: {
    type: [String, Number] as PropType<string | number>,
    required: false,
    default: '40px'
  },
  color: {
    type: String,
    required: false,
    default: 'black'
  }
})
</script>

<style lang="scss" scoped>

</style>
