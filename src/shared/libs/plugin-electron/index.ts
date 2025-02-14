import { makeRunner } from './make.js'
import { packageRunner } from './package.js'
import { previewRunner } from './preview.js'

import { createNodeDefinition } from '@pipelab/plugin-core'
import icon from './public/electron.webp'
import {
  createMakeProps,
  createPackageProps,
  createPackageV2Props,
  createPreviewProps,
  IDMake,
  IDPackage,
  IDPackageV2,
  IDPreview
} from './forge.js'
import { configureRunner, props } from './configure.js'
import { packageV2Runner } from './package-v2.js'

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
        'Package app',
        'Gather all necessary files and prepare your app for distribution, creating a platform-specific bundle.',
        '',
        "`Package app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
      ),
      runner: packageRunner,
      advanced: true
    },
    // package v2
    {
      node: createPackageV2Props(
        IDPackageV2,
        'Package app with configuration',
        'Gather all necessary files and prepare your app for distribution, creating a platform-specific bundle.',
        '',
        "`Package app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
      ),
      runner: packageV2Runner
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
