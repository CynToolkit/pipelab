import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'

export const ID = 'minify:images'

export const minifyImages = createAction({
  id: ID,
  name: 'Minify images',
  description: '',
  icon: '',
  displayString: '`Minify`',
  meta: {},
  params: {
    'input-folder': createPathParam('', {
      required: true,
      label: 'Folder to Upload',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    })
  },
  outputs: {}
})

export const minifyImagesRunner = createActionRunner<typeof minifyImages>(
  async ({ log, inputs, cwd, abortSignal }) => {
    const { app } = await import('electron')
    const { join, dirname } = await import('node:path')
    const { mkdir, access, chmod } = await import('node:fs/promises')

    // TODO: https://github.com/imagemin/imagemin

    log('Minified images')
  }
)
