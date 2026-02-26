import { minifyCode, minifyCodeRunner } from './code'
import { minifyImages, minifyImagesRunner } from './images'

import { createNodeDefinition } from '@pipelab/plugin-core'

export default createNodeDefinition({
  description: 'Minify and compress code and images',
  name: 'Minifyer',
  id: 'poki',
  icon: {
    type: 'icon',
    icon: 'mdi-zip-box'
  },
  nodes: [
    // make and package
    {
      node: minifyCode,
      runner: minifyCodeRunner
    },
    {
      node: minifyImages,
      runner: minifyImagesRunner
    }
  ]
})
