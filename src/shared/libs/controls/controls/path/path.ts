const ClassicPreset = {
  Control: class {}
}

export type PathOptions<TYPE> = {
  label: string;
  initial?: TYPE;
  readonly?: boolean;
  change?: (value: TYPE) => void;
};

export class CynControlPath extends ClassicPreset.Control {
  options: PathOptions<string>;
  value: string | undefined;

  constructor(options: PathOptions<string>) {
    super();
    this.options = options;
  }

  setValue(value: string) {
    this.value = value;
    if (this.options.change) {
      this.options.change(value);
    }
  }
}
