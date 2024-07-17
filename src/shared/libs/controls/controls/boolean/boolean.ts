const ClassicPreset = {
  Control: class {}
}

export interface CynBooleanOption {
  label: string;
  value: unknown;
}

export interface CynControlBooleanOptions {
  label: string;
  value: boolean
  readonly: boolean
  disabled: boolean
  onInput: (value: boolean) => void
}

export class CynControlBoolean extends ClassicPreset.Control {
  options: CynControlBooleanOptions;

  constructor(options: CynControlBooleanOptions) {
    super();
    this.options = options
  }
}
