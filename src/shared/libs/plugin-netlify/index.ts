import { uploadToNetlify, uploadToNetlifyRunner } from './export'

import { createNodeDefinition } from '@pipelab/plugin-core'
import icon from './assets/netlify-icon.webp'

export default createNodeDefinition({
  description: 'Netlify',
  name: 'Netlify',
  id: 'netlify',
  icon: {
    type: 'image',
    image: icon
  },
  nodes: [
    // make and package
    {
      node: uploadToNetlify,
      runner: uploadToNetlifyRunner
    }
  ]
})
