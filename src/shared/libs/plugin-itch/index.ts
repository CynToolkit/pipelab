import { uploadToItch, uploadToItchRunner } from './export'

import { createNodeDefinition } from '@pipelab/plugin-core'
// import icon from './public/itch.webp'

export default createNodeDefinition({
  description: 'Itch.io',
  name: 'Itch.io',
  id: 'itch.io',
  icon: {
    type: 'icon',
    icon: 'mdi-home'
  },
  // icon: {
  //   type: 'image',
  //   image: icon
  // },
  nodes: [
    // make and package
    {
      node: uploadToItch,
      runner: uploadToItchRunner
    }
  ]
})
