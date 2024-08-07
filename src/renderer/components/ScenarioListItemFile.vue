<template>
  <div v-if="isLoading"><Skeleton width="10rem" height="1rem"></Skeleton></div>
  <!-- @vue-ignore -->
  <ScenarioListItem
    @click="emit('click', data)"
    :scenario="data"
    v-else-if="data"
  ></ScenarioListItem>
</template>

<script lang="ts" setup>
import ScenarioListItem from '@renderer/components/ScenarioListItem.vue'
import { useAPI } from '@renderer/composables/api'
import { SavedFile } from '@@/model'
import { onMounted, ref, toRefs } from 'vue'

const props = defineProps({
  path: {
    type: String,
    required: true
  }
})

const emit = defineEmits<{
  click: [payload: SavedFile]
}>()

const { path } = toRefs(props)
const api = useAPI()

const data = ref<SavedFile>()
const isLoading = ref(true)

onMounted(async () => {
  const dataRaw = await api.execute('fs:read', {
    path: path.value
  })

  if ('content' in dataRaw) {
    data.value = JSON.parse(dataRaw.content) as SavedFile
  } else {
    throw new Error('Invalid file content')
  }
  isLoading.value = false
})
</script>

<style lang="scss" scoped></style>
