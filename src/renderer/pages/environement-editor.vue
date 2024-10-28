<template>
  <div class="environements-editor">
    <template v-for="environement in environements" :key="environement.id">
      <div class="environement-wrapper" @click="editVariable(environement.id)">
        <div class="environement">
          <div class="title">{{ environement.name }}</div>
          <div class="subtitle">{{ environement.description }}</div>
          <div class="content">{{ environement.value }}</div>
        </div>
      </div>
    </template>
    <Button
      disabled
      class="add-btn"
      label="Add environement"
      icon="pi pi-plus"
      @click="addVariable"
    ></Button>

    <Dialog
      v-model:visible="isNewVariableDialogVisible"
      modal
      header="Add environement"
      :style="{ width: '25rem' }"
    >
      <div class="flex flex-column gap-2 mb-4">
        <label for="name" class="font-semibold w-24">Name</label>
        <InputText id="name" v-model="name" class="flex-auto" autocomplete="off" />
      </div>
      <div class="flex flex-column gap-2 mb-4">
        <label for="description" class="font-semibold w-24">Description</label>
        <InputText id="description" v-model="description" class="flex-auto" autocomplete="off" />
      </div>
      <div class="flex flex-column gap-2 mb-4">
        <label for="content" class="font-semibold w-24">Content</label>

        <!-- Code editor -->
        <div ref="$codeEditorText" class="code-editor"></div>
      </div>
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          @click="isNewVariableDialogVisible = false"
        ></Button>
        <Button type="button" label="Save" @click="onSave"></Button>
        <Button
          v-if="mode === 'edit' && dialogId"
          class="del-btn"
          label="Delete"
          icon="pi pi-trash"
          @click="remVariable(dialogId)"
        ></Button>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { createCodeEditor } from '@renderer/utils/code-editor'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

const instance = useEditor()
const { environements } = storeToRefs(instance)
const {
  addVariable: instanceAddVariable,
  updateVariable: instanceUpdateVariable,
  removeVariable: instanceRemoveVariable
} = instance

const isNewVariableDialogVisible = ref(false)

const $codeEditorText = ref<HTMLDivElement>()

const name = ref('')
const description = ref('')

const {
  update: codeEditorTextUpdate,
  onUpdate: onCodeEditorTextUpdate,
  value: editorTextValue
} = createCodeEditor($codeEditorText, [
  // javascriptLanguage.data.of({
  //   // autocomplete: myCompletions
  // })
])

const onSave = () => {
  isNewVariableDialogVisible.value = false

  if (mode.value === 'create') {
    instanceAddVariable({
      id: nanoid(),
      value: editorTextValue.value,
      description: description.value,
      name: name.value
    })
  } else {
    instanceUpdateVariable({
      id: dialogId.value,
      value: editorTextValue.value,
      description: description.value,
      name: name.value
    })
  }
}

const dialogId = ref<string>()

const addVariable = () => {
  isNewVariableDialogVisible.value = true
  mode.value = 'create'
}

const remVariable = (id: string) => {
  isNewVariableDialogVisible.value = false
  instanceRemoveVariable(id)
}

const mode = ref<'create' | 'edit'>('create')
const editVariable = (id: string) => {
  const foundVar = environements.value.find((x) => x.id === id)
  if (foundVar) {
    codeEditorTextUpdate(foundVar.value)
    name.value = foundVar.name
    description.value = foundVar.description
    mode.value = 'edit'
    dialogId.value = foundVar.id
  }
  isNewVariableDialogVisible.value = true
}
</script>

<style scoped lang="scss">
.environements-editor {
  margin: 16px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.environement {
  border: 1px solid #c2c9d1;
  padding: 16px;
  // margin: 4px;
  border-radius: 4px;
  width: fit-content;
}

.environement {
  border: 1px solid #c2c9d1;
  padding: 16px;
  border-radius: 4px;
  width: 100%;
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 32px;
}

.environement-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.add-btn {
  margin-top: 16px;
  align-self: center;
}

:deep(.code-editor) {
  max-height: 200px;

  .cm-gutter,
  .cm-content {
    min-height: 200px;
  }
  .cm-scroller {
    overflow: auto;
  }
}
</style>
