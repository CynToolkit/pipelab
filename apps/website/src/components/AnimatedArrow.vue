<template>
  <div class="container">
    <svg width="2" :height="height" :style="svgStyle">
      <line
        x1="1"
        y1="0"
        x2="1"
        :y2="height"
        stroke="#333"
        stroke-width="2"
        stroke-dasharray="50"
        stroke-dashoffset="50"
      >
        <animate
          attributeName="stroke-dashoffset"
          :from="height"
          to="0"
          dur="0.3s"
          fill="freeze"
          ref="$animateLine"
          begin="indefinite"
        />
      </line>
      <path
        :d="`M -5 ${height - 5} L 1 ${height} L 7 ${height - 5}`"
        fill="none"
        stroke="#333"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="0.3s"
          fill="freeze"
          ref="$animateHead"
          begin="indefinite"
        />
      </path>
    </svg>
  </div>
</template>

<script lang="ts" setup>
import { ref } from "vue";

const $animateLine = ref<SVGAnimateElement>()
const $animateHead = ref<SVGAnimateElement>()

const props = defineProps({
  color: {
    type: String,
    default: "#333",
  },
  height: {
    type: Number,
    default: 30,
  },
});

const svgStyle = ref({
  overflow: "visible",
});

const animateHead = () => {
  if ($animateHead.value) {
    $animateHead.value.beginElement();
  }
};

const animateLine = () => {
  if ($animateLine.value) {
    $animateLine.value.beginElement();
  }
};

defineExpose({
  animateHead,
  animateLine,
});
</script>

<style scoped>
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
</style>
