import { makeRunner } from './make.js'
import { packageRunner } from './package.js'
import { previewRunner } from './preview.js'

import { createNodeDefinition } from '@plugins/plugin-core'
import icon from './public/tauri.webp'
import {
  createMakeProps,
  createPackageProps,
  createPreviewProps,
  IDMake,
  IDPackage,
  IDPreview
} from './forge.js'
import { configureRunner, props } from './configure.js'

export default createNodeDefinition({
  description: 'Tauri',
  name: 'Tauri',
  id: 'tauri',
  icon: {
    type: 'image',
    image: icon
  },
  nodes: [
    // make and package
    {
      node: createMakeProps(
        IDMake,
        'Create Installer',
        'Create a distributable installer for your chosen platform',
        '',
        "`Build package for ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`"
      ),
      runner: makeRunner
      // disabled: platform === 'linux' ? 'Electron is not supported on Linux' : undefined
    },
    // package
    {
      node: createPackageProps(
        IDPackage,
        'Prepare App Bundle',
        'Gather all necessary files and prepare your app for distribution, creating a platform-specific bundle.',
        '',
        "`Package app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
      ),
      runner: packageRunner
    },
    {
      node: createPreviewProps(
        IDPreview,
        'Preview app',
        'Package and preview your app from an URL',
        '',
        "`Preview app from ${fmt.param(params['input-url'], 'primary', 'Input folder not set')}`",
      ),
      runner: previewRunner
    },
    {
      node: props,
      runner: configureRunner
    }
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
