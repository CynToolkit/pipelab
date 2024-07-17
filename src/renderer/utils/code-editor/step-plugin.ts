import {
  Decoration,
  MatchDecorator,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'

class PlaceholderWidget extends WidgetType {
  value: string
  constructor(value: string) {
    super()
    this.value = value
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')

    span.textContent = this.value
    span.className = 'step-placeholder'

    return span
  }
}

const placeholderMatcher = new MatchDecorator({
  regexp: /(?<full>steps\['(?<node_id>[\w-]+)'\]\['outputs'\]\['(?<output>[\w-]+)'\])/g,
  decoration: (match) => {
    console.log('match', match)
    const { full, node_id, output } = match.groups ?? {
      full: match.input,
    }
    return Decoration.replace({
      widget: new PlaceholderWidget(full)
    })
  }
})

export const placeholders = ViewPlugin.fromClass(
  class {
    placeholders: DecorationSet
    constructor(view: EditorView) {
      this.placeholders = placeholderMatcher.createDeco(view)
      console.log('this.placeholders', this.placeholders)
    }
    update(update: ViewUpdate) {
      this.placeholders = placeholderMatcher.updateDeco(update, this.placeholders)
      console.log('this.placeholders', this.placeholders)
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
