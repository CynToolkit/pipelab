<template>
  <div class="control-input">
    <label class="input-label">
      <div class="label">{{ data.options.label }}</div>
      <InputText
        :type="data.options.type"
        :value="data.options.value"
        :readonly="data.options.readonly"
        size="small"
        @input="onChange"
        @pointerdown.stop=""
      />
    </label>
  </div>
</template>

<script lang="ts">
export default {
  name: 'CynControlInput'
}
</script>

<script lang="ts" setup>
import { CynControlInput } from '@cyn/controls'
import { type PropType, toRefs } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<CynControlInput<'text' | 'number', 'text'>>,
    required: true
  }
})

const { data } = toRefs(props)

const onChange = (e: Event) => {
  const val =
    data.value.options.type === 'number'
      ? // @ts-expect-error value
        +e.target?.value
      : // @ts-expect-error value
        e.target?.value

  data.value.options.onInput(val)
}
</script>

<style lang="scss" scoped>
.control-input {
  // margin-left: 54px;

  .label {
    margin-bottom: 4px;
  }

  input {
    // width: 100%;
  }
}
</style>
