import { make, makeRunner } from './make.js'
import { packageApp, packageRunner } from './package.js'

import { createNodeDefinition } from '@cyn/plugin-core'
import icon from './public/electron.webp'

import { platform } from 'process'

export default createNodeDefinition({
  description: "Electron",
  name: "Electron",
  id: "electron",
  icon: {
    type: "image",
    image: icon,
  },
  nodes: [
    // make and package
    {
      node: make,
      runner: makeRunner,
      // disabled: platform === 'linux' ? 'Electron is not supported on Linux' : undefined
    },
    // package
    {
      node: packageApp,
      runner: packageRunner,
    },
    // make without package
    // {
    //   node: packageApp,
    //   runner: packageRunner,
    // },
  ],
});
