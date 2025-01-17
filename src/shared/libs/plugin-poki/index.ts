import { uploadToPoki, uploadToPokiRunner } from './export'

import { createNodeDefinition } from '@pipelab/plugin-core'
import icon from './assets/poki-icon.webp'

export default createNodeDefinition({
  description: 'Poki',
  name: 'Poki',
  id: 'poki',
  icon: {
    type: 'image',
    image: icon
  },
  nodes: [
    // make and package
    {
      node: uploadToPoki,
      runner: uploadToPokiRunner
    }
  ]
})
