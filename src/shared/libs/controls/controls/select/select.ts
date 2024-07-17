const ClassicPreset = {
  Control: class {}
}

export interface CynSelectOption {
  label: string;
  value: string;
}

export interface CynControlSelectOptions {
  label: string;
  options: CynSelectOption[];
  value: string
  onInput: (value: string) => void
}

export class CynControlSelect extends ClassicPreset.Control {
  options: CynControlSelectOptions

  constructor(options: CynControlSelectOptions) {
    super();
    this.options = options
  }
}
