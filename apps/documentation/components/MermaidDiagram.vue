<template>
    <pre
        ref="mermaid"
        class="mermaid"
    >
        {{ modelValue  }}
    </pre>
</template>

<script lang="ts" setup>
import { onMounted, ref, useTemplateRef } from 'vue';
import mermaid from 'mermaid'

// const mermaidRef = useTemplateRef('mermaid')

const { modelValue } = defineProps<{ modelValue: string }>()

onMounted(() => {
    // mermaidRef.value?.innerHTML = modelValue
    mermaid.initialize({ startOnLoad: true })
})
</script>

<style lang="scss" scoped></style>