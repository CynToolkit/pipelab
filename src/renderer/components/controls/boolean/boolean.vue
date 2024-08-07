<template>
  <div>
    <label>
      <!-- <SelectButton :value="data.options.value" @change="onChange" @pointerdown.stop="">
        <option :value="true">true</option>
        <option :value="false">false</option>
      </SelectButton> -->
      <span>{{ data.options.label }} ({{ data.options.value }})</span>
    </label>
  </div>
</template>

<script lang="ts">
export default {
  name: 'CynControlBoolean'
}
</script>

<script lang="ts" setup>
import { CynControlBoolean } from '@cyn/controls'
import { type PropType, toRefs, watch } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<CynControlBoolean>,
    required: true
  }
})

const { data } = toRefs(props)

// watch(
//   data,
//   () => {
//     console.log('--> data', data.value)
//   },
//   {
//     deep: true
//   }
// )

// const onChange = (e: Event) => {
//   console.log('data.value', e)

//   // @ts-expect-error
//   const value = e.target?.value === 'true' ? true : false

//   console.log('new value', value)

//   data.value.options.onInput(value)
// }
</script>

<style lang="scss" scoped>
input {
  width: 100%;
  border-radius: 30px;
  background-color: white;
  padding: 2px 6px;
  border: 1px solid #999;
  font-size: 110%;
  box-sizing: border-box;
}
</style>
