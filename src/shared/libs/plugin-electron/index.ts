import { makeRunner } from './make.js'
import { packageRunner } from './package.js'

import { createNodeDefinition } from '@pipelab/plugin-core'
import icon from './public/electron.webp'
import { createProps, IDMake, IDPackage } from './forge.js'
import { configureRunner, props } from './configure.js'

export default createNodeDefinition({
  description: 'Electron',
  name: 'Electron',
  id: 'electron',
  icon: {
    type: 'image',
    image: icon
  },
  nodes: [
    // make and package
    {
      node: createProps(
        IDMake,
        'Create Installer',
        'Create a distributable installer for your chosen platform',
        '',
        "`Build package for ${fmt.param(params['input-folder'], 'primary')}`"
      ),
      runner: makeRunner
      // disabled: platform === 'linux' ? 'Electron is not supported on Linux' : undefined
    },
    // package
    {
      node: createProps(
        IDPackage,
        'Prepare App Bundle',
        'Gather all necessary files and prepare your app for distribution, creating a platform-specific bundle.',
        '',
        "`Package app from ${fmt.param(params['input-folder'], 'primary')}`"
      ),
      runner: packageRunner
    },
    {
      node: props,
      runner: configureRunner
    },
    // {
    //   node: propsConfigureV2,
    //   runner: configureV2Runner
    // }
    // make without package
    // {
    //   node: packageApp,
    //   runner: packageRunner,
    // },
  ]
})
