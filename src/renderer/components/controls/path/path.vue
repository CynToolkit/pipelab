<template>
  <div>
    <label>
      <input
        type="string"
        :value="data.value"
        :disabled="true"
        @change="onChange"
        @pointerdown.stop=""
      />
      <span>{{ data.options.label }}</span>
    </label>
    <button @click="onClick">Change</button>
  </div>
</template>

<script lang="ts">
export default {
  name: 'CynControlPath'
}
</script>

<script lang="ts" setup>
import { CynControlPath } from '@cyn/controls'
import { useAPI } from '@renderer/composables/api'
import { type PropType, toRefs, watch } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<CynControlPath>,
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

const onChange = (e: Event) => {
  console.log('data.value', e)

  // @ts-expect-error
  data.value.setValue(e.target.value)
}

const api = useAPI()
const onClick = async () => {
  const paths = await api.execute(
    'dialog:showOpenDialog',
    { title: 'Choose a new path', properties: ['openDirectory'] },
    async (_, message) => {
      const { type, data } = message
      if (type === 'end') {
        console.log('end', data)
      }
    }
  )

  console.log('paths', paths)
}
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
