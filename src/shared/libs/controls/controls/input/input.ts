import { nanoid } from 'nanoid'
const ClassicPreset = {
    Control: class {}
}

export type CynControlInputOptions<T extends "number" | "text", N = T extends "text" ? string : number> = {
    label: string,
    value: N
    readonly: boolean
    disabled: boolean
    onInput: (value: N) => void
    type: T
}

export class CynControlInput<T extends "number" | "text", N = T extends "text" ? string : number> extends ClassicPreset.Control {
    options: CynControlInputOptions<T, N>;

    constructor(options: CynControlInputOptions<T, N>) {
        super()
        this.options = options
    }
}
