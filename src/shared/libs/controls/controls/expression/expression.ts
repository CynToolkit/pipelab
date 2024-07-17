import { nanoid } from 'nanoid'
const ClassicPreset = {
    Control: class {}
  }

export type CynControlExpressionOptions = {
    label: string
    value: string
    readonly: boolean
    disabled: boolean
    onInput: (value: string) => void
}

export class CynControlExpression extends ClassicPreset.Control {
    options: CynControlExpressionOptions;

    constructor(options: CynControlExpressionOptions) {
        super()
        this.options = options
    }
}
