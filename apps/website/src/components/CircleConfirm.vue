<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
  >
    <g
      fill="none"
      :stroke="color"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    >
      <circle cx="12" cy="12" r="9"></circle>
      <path stroke-dasharray="14" stroke-dashoffset="14" d="M8 12L11 15L16 10">
        <animate
          fill="freeze"
          attributeName="stroke-dashoffset"
          dur="0.2s"
          values="14;0"
          ref="$animate"
          begin="indefinite"
        ></animate>
      </path>
    </g>
  </svg>
</template>

<script lang="ts" setup>
import { ref } from 'vue';

const props = defineProps({
  color: {
    type: String,
    default: "#333",
  },
});

const $animate = ref<SVGAnimateElement>()

const start = () => {
    if ($animate.value) {
        $animate.value.beginElement()
    }
}

defineExpose({
    start
})
</script>
