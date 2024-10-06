<template>
  <div class="variables-editor">
    <template v-for="variable in variables" :key="variable.id">
      <div class="variable-wrapper">
        <div class="variable">
          <div class="title">{{ variable.name }}</div>
          <div class="subtitle">{{ variable.description }}</div>
          <div class="content">{{ variable.value }}</div>
        </div>
      </div>
    </template>
    <Button class="add-btn" label="Add variable" icon="pi pi-plus" @click="addVariable"></Button>

    <Dialog
      v-model:visible="isNewVariableDialogVisible"
      modal
      header="Add variable"
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
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { createCodeEditor } from '@renderer/utils/code-editor'
import { nanoid } from 'nanoid'
import { javascriptLanguage } from '@codemirror/lang-javascript'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

const instance = useEditor()
const { variables } = storeToRefs(instance)
const { addVariable: instanceAddVariable } = instance

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

  instanceAddVariable({
    id: nanoid(),
    value: editorTextValue.value,
    description: description.value,
    name: name.value
  })
}

const addVariable = () => {
  isNewVariableDialogVisible.value = true
}
</script>

<style scoped lang="scss">
.variables-editor {
  margin: 16px;
  display: flex;
  flex-direction: column;
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
  width: 100%;
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 32px;
}

.variable-wrapper {
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
