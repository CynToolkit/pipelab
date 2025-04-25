import { makeRunner } from './make.js'
import { previewRunner } from './preview.js'

import { createNodeDefinition } from '@pipelab/plugin-core'
import icon from './public/tauri.webp'
import {
  createMakeProps,
  createPackageV2Props,
  createPreviewProps,
  IDMake,
  IDPackageV2,
  IDPreview
} from './tauri.js'
import { configureRunner, props } from './configure.js'
import { packageV2Runner } from './package.js'

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
      // disabled: platform === 'linux' ? 'Tauri is not supported on Linux' : undefined
    },
    {
      node: createPackageV2Props(
        IDPackageV2,
        'Package app with configuration',
        'Gather all necessary files and prepare your app for distribution, creating a platform-specific bundle.',
        '',
        "`Package app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
        false,
        false,
        undefined,
        false,
        false
      ),
      runner: packageV2Runner,
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
      runner: configureRunner,
    }
  ]
})
