export const fmt = {
  param: (value: string, variant?: 'primary' | 'secondary' | undefined, ifEmpty: string = "") => {
    return `<div class="param ${variant ? variant : ''}">${value ? value : ifEmpty}</div>`
  }
}
