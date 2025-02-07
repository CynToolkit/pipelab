import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'

export const ID = 'zip-node'

export type MaybeArray<T> = T | T[]

export const getValue = <T>(array: MaybeArray<T>): T => {
  if (Array.isArray(array)) {
    return array[0]
  } else {
    return array
  }
}

export const zip = createAction({
  id: ID,
  name: 'Zip',
  displayString: `Zip folder "{{ params.folder }}"`,
  params: {
    folder: createPathParam('', {
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      },
      label: 'Folder'
    })
  },

  outputs: {
    path: {
      value: '',
      label: 'Path'
    }
  },
  description: 'Zip a folder into a .zip file',
  icon: '',
  meta: {}
})

export const zipRunner = createActionRunner<typeof zip>(async ({ log, inputs, setOutput }) => {
  const fs = await import('node:fs/promises')
  const readdir = fs.readdir

  log('TODO')

  // log("inputs", inputs);

  // const folder = getValue(inputs.folder);

  // log("folder", folder);

  // const response = await readdir(folder, {
  //   withFileTypes: true,
  //   recursive,
  // });

  // log("response", response);

  // const files = response;

  // log("-- setValue('paths')");
  // setOutput(
  //   "paths",
  //   files.map((x) => path.join(x.path, x.name))
  // );
})
