<template>
  <div v-if="isLoading"> <Skeleton width="10rem" height="1rem"></Skeleton> </div>
  <div @click="emit('click', item)" v-else-if="item">
    <div class="local" v-if="item.saveLocation.type === 'external'">
      {{ item.name }}
    </div>
    <div class="cloud" v-else-if="item.saveLocation.type === 'pipelab-cloud'">
      {{ item.name }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Recent } from '@renderer/store/recents';
import { PropType, ref, toRefs } from 'vue'

const props = defineProps({
  item: {
    type: Object as PropType<Recent>,
    required: true
  }
})

const emit = defineEmits<{
  click: [payload: Recent],
}>()

const { item } = toRefs(props)

// const data = ref<SavedFile>()
const isLoading = ref(true)

// const dataRaw = await api.execute('fs:read', {
//   path: path.value
// })

// console.log('data', data)

// data.value = JSON.parse(dataRaw.content) as SavedFile
isLoading.value = false
</script>

<style lang="scss" scoped></style>
