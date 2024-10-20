<template>
  <div class="projects-editor">
    <div class="flex items-center">
      <label for="ingredient1" class="ml-2"> No project settings </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'

const instance = useEditor()
</script>

<style scoped lang="scss">
.projects-editor {
  margin: 16px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.project {
  border: 1px solid #c2c9d1;
  padding: 16px;
  // margin: 4px;
  border-radius: 4px;
  width: fit-content;
}

.project {
  border: 1px solid #c2c9d1;
  padding: 16px;
  border-radius: 4px;
  width: fit-content;
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 32px;
}

.project-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
