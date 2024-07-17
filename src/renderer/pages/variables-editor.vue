<template>
  <div class="variables-editor">
    <template v-for="variable in variables" :key="variable.id">
      <div class="variable-wrapper">
        <div class="variable">
          <div>
            <span v-if="variable.type === 'string'" class="pi pi-question-circle"></span>
            <span v-if="variable.type === 'array'" class="pi pi-play"></span>
            <span v-if="variable.type === 'boolean'" class="pi pi-bolt"></span>
          </div>
          <div class="title">{{ variable.name }}</div>
          <div class="subtitle">{{ variable.description }}</div>
        </div>
      </div>
    </template>
    <Button
      class="add-btn"
      label="Ajouter une variable"
      icon="pi pi-plus"
      @click="addVariable"
    ></Button>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'

const instance = useEditor()
const { variables } = storeToRefs(instance)
const { addVariable: instanceAddVariable } = instance

const addVariable = () => {
  instanceAddVariable({
    id: nanoid(),
    type: 'string',
    value: 'aaa',
    description: 'aaaaaaaaaa sdsdsdsdsd',
    name: 'variaaaa'
  })
}
</script>

<style scoped lang="scss">
.variables-editor {
  margin: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: auto;
}

.variable {
  border: 1px solid #c2c9d1;
  padding: 16px;
  // margin: 4px;
  border-radius: 4px;
  width: fit-content;
}

.variable {
  border: 1px solid #c2c9d1;
  padding: 16px;
  border-radius: 4px;
  width: fit-content;
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 32px;
}

.variable-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
