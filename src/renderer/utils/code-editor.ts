import { readonly, Ref, ref, shallowRef, watch } from 'vue'
import { EditorView, keymap, lineNumbers, ViewUpdate } from '@codemirror/view'
import { history, historyKeymap, indentWithTab, defaultKeymap } from '@codemirror/commands'
import type { Extension } from '@codemirror/state'
import { autocompletion } from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { createEventHook } from '@vueuse/core'
import { tomorrow } from 'thememirror'
import { placeholders } from './code-editor/step-plugin'

export const createCodeEditor = (
  element: Ref<HTMLDivElement | undefined>,
  extraExtensions?: Extension | undefined
) => {
  const { on: onUpdate, trigger: triggerUpdate } = createEventHook<string>()

  const resolveValue = (raw: string): string => {
    // Parse the raw string to extract step, output, and field
    const match = raw.match(/steps\['([\w-]+)'\]\['outputs'\]\['([\w-]+)'\]/)
    if (!match) return `Invalid: ${raw}`

    const [, step, field] = match

    // Simulate fetching or computing the value dynamically
    // In a real scenario, this might involve API calls, computation, or accessing a state management store
    const simulateDynamicResolution = (step: string, field: string): string => {
      // This is a placeholder. Replace with your actual dynamic resolution logic
      const timestamp = new Date().toISOString()
      return `${step}.${field} @ ${timestamp}`
    }

    return simulateDynamicResolution(step, field)
  }

  const createBaseEditor = () => {
    return new EditorView({
      doc: '',
      extensions: [
        lineNumbers(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        javascript(),
        autocompletion(),
        history(),
        placeholders,
        tomorrow,
        EditorView.updateListener.of((v: ViewUpdate) => {
          if (v.docChanged) {
            const data = v.state.doc.toString()
            internalValue.value = data
            triggerUpdate(data)
          }
        }),
        ...(extraExtensions ? [extraExtensions] : [])
      ]
    })
  }

  const editor = shallowRef<EditorView>(createBaseEditor())

  watch(
    element,
    () => {
      if (element.value) {
        element.value.append(editor.value.dom)
      }
    },
    {
      immediate: true
    }
  )

  const internalValue = ref(editor.value.state.doc.toString())

  const update = (value: string) => {
    console.log('value', value)
    if (editor.value.state.doc.toString() === value) {
      return
    }
    if (editor.value) {
      const transaction = editor.value.state.update({
        changes: { from: 0, to: editor.value.state.doc.length, insert: value }
      })
      const update = editor.value.state.update(transaction)
      editor.value.update([update])
    }
  }

  return {
    editor,

    value: readonly(internalValue),

    update,
    onUpdate
  }
}
