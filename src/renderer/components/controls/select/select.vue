<template>
  <div>
    <label>
      <!-- <select :value="data.value" @change="onChange" @pointerdown.stop="">
        <option v-for="(option, index) in data.options" :key="index" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <span>{{ data.label }}</span> -->
    </label>
  </div>
</template>

<script lang="ts">
export default {
  name: 'CynControlPath'
}
</script>

<script lang="ts" setup>
import { CynControlSelect } from '@cyn/controls'
import { type PropType, toRefs, watch } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<CynControlSelect>,
    required: true
  }
})

const { data } = toRefs(props)

watch(
  data,
  () => {
    console.log('--> data', data.value)
  },
  {
    deep: true
  }
)

// const onChange = (e: Event) => {
//   console.log('data.value', e)

//   // @ts-expect-error
//   data.value.setValue(e.target?.value)
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
