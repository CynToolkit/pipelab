import { BlockAction, Steps } from '@@/model'
import { Variable } from '@@/libs/core-app'
import {
  Decoration,
  MatchDecorator,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'
import type { ValueOf } from 'type-fest'
import { Ref } from 'vue'

class PlaceholderWidget extends WidgetType {
  value: string
  options: Options
  nodeId: string
  output: string

  constructor(value: string, options: Options, nodeId: string, output: string) {
    super()
    this.value = value
    this.options = options
    this.nodeId = nodeId
    this.output = output
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')

    console.log('this.value', this.value)

    // const vm = await createQuickJs()

    // const result = await vm.run(this.value, {
    //   steps: this.options.steps.value
    // })

    // console.log('result', result)

    console.log('nodeId', this.nodeId)
    console.log('output', this.output)
    console.log('this.options.steps.value', this.options.steps.value)

    const result = this.options.steps.value?.[this.nodeId]?.outputs[this.output]

    span.classList.add('step-placeholder')
    if (result) {
      span.innerHTML = result
    } else {
      span.textContent = 'Step missing'
      span.classList.add('step-missing')
    }

    return span
  }
}

const placeholderMatcher = (options: Options) =>
  new MatchDecorator({
    regexp: /(?<full>steps\['(?<node_id>[\w-]+)'\]\['outputs'\]\['(?<output>[\w-]+)'\])/g,
    decoration: (match) => {
      const { full, node_id, output } = match.groups ?? {
        full: match.input
      }
      return Decoration.replace({
        widget: new PlaceholderWidget(full, options, node_id, output)
      })
    }
  })

type Param = ValueOf<BlockAction['params']>

interface Options {
  param: Ref<Param | undefined>
  steps: Ref<Steps>
  variables: Ref<Variable[]>
}
export const stepsPlaceholders = (options: Options) => {
  return ViewPlugin.fromClass(
    class {
      placeholders: DecorationSet

      constructor(view: EditorView) {
        this.placeholders = placeholderMatcher(options).createDeco(view)
      }
      update(update: ViewUpdate) {
        this.placeholders = placeholderMatcher(options).updateDeco(update, this.placeholders)
      }
    },
    {
      decorations: (instance) => instance.placeholders,
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => {
          return view.plugin(plugin)?.placeholders || Decoration.none
        })
    }
  )
}
