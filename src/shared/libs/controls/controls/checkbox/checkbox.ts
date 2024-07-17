const ClassicPreset = {
    InputControl: class <T, U>{}
}

    // @ts-expect-error
export type CynControlCheckboxOptions = CheckboxControl['options'] & { label: string } | undefined
export class CheckboxControl extends ClassicPreset.InputControl<
    'checkbox',
    boolean
> {
    label: string | undefined;

    constructor(options: CynControlCheckboxOptions) {
        // @ts-expect-error
        super('checkbox', options)
        this.label = options?.label
    }
}

export class CynControlCheckbox extends CheckboxControl {
    constructor(options: CynControlCheckboxOptions) {
        super(options);
    }
}
