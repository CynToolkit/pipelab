<template>
  <div v-if="data" class="control-checkbox">
    <label>
      <!-- <Checkbox
        :value="true"
        :readonly="data.readonly"
        :binary="true"
        @change="onChange"
        @pointerdown.stop=""
      />
      <span>{{ data.options?.label }}</span> -->
    </label>
  </div>
</template>

<script lang="ts">
export default {
  name: 'CynControlCheckbox'
}
</script>

<script lang="ts" setup>
import { CynControlCheckbox } from '@cyn/controls'
import { type PropType, toRefs, watch } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<CynControlCheckbox>,
    required: true
  }
})

const { data } = toRefs(props)

// const onChange = (e: Event) => {
//   console.log('data.value', data.value)
//   // @ts-expect-error
//   data.value.setValue(e.target?.checked)
// }
</script>

<style lang="scss" scoped>
.control-checkbox {
  margin-left: 54px;
}
</style>
