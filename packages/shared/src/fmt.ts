export const fmt = {
  param: (value: string, variant?: 'primary' | 'secondary' | undefined, ifEmpty: string = "") => {
    return `<span class="param ${variant ? variant : ''}">${value ? value : ifEmpty}</span>`
  }
}
