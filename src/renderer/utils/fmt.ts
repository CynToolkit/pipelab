export const fmt = {
  param: (value: string, variant?: 'primary' | 'secondary' | undefined) => {
    return `<div class=\"param ${variant ? variant : ''}\">${value}</div>`
  }
}
