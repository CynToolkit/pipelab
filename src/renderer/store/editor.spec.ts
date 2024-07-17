import { describe, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
// import { useAPI } from '@renderer/composables/api'

// vi.mock('@renderer/composables/api', () => ({
//   useAPI: () => {
//     return {
//       execute: (value: string) => {
//         if (value === 'nodes:get') {
//           return ref([])
//         }
//       }
//     }
//   }
// }))

describe('editor store', () => {
  // let editor: UseEditorFn

  beforeEach(() => {
    // creates a fresh pinia and makes it active
    // so it's automatically picked up by any useStore() call
    // without having to pass it to it: `useStore(pinia)`
    setActivePinia(createPinia())

    // editor = useEditor()
    // editor.initialization()
  })

  // describe('node insertion', () => {
  //   it('insert at one level deep', async () => {
  //     const demo = await demoPreset()
  //     editor.loadSavedFile(demo.data)

  //     editor.addNode({
  //       node: {
  //         type: 'action',
  //         origin: {
  //           pluginId: 'construct',
  //           nodeId: 'export-construct-project'
  //         },
  //         uid: 'aaaa',
  //         params: {}
  //       },
  //       path: ['0']
  //     })

  //     expect(editor.nodes).toStrictEqual([
  //       {
  //         type: 'event',
  //         origin: { pluginId: 'system', nodeId: 'manual' },
  //         uid: 'manual-start',
  //         params: {}
  //       },
  //       {
  //         type: 'action',
  //         origin: {
  //           pluginId: 'construct',
  //           nodeId: 'export-construct-project'
  //         },
  //         uid: 'aaaa',
  //         params: {}
  //       },
  //       {
  //         type: 'action',
  //         origin: { pluginId: 'construct', nodeId: 'export-construct-project' },
  //         uid: 'export-construct-project',
  //         params: { version: '300', username: 'quentin', password: 'aaa', headless: false }
  //       },
  //       {
  //         type: 'action',
  //         origin: { pluginId: 'filesystem', nodeId: 'list-files-node' },
  //         uid: 'list-files-node',
  //         params: { folder: '/home/quentin/Téléchargements/sourcegit/', recursive: true }
  //       },
  //       {
  //         type: 'loop',
  //         origin: { pluginId: 'system', nodeId: 'for' },
  //         params: { value: "{{ steps[list-files-node]['outputs']['paths'] }}" },
  //         children: [
  //           {
  //             type: 'condition',
  //             origin: { pluginId: 'filesystem', nodeId: 'is-file' },
  //             uid: 'is-file-condition',
  //             params: {
  //               path: "{{ steps['list-files-node']['outputs']['paths'][context.loopindex] }}"
  //             },
  //             branchTrue: [
  //               {
  //                 type: 'action',
  //                 origin: { pluginId: 'system', nodeId: 'log' },
  //                 params: { message: "File: {{ steps[list-files-node]['outputs']['paths'] }}" },
  //                 uid: 'log-ok-in-foreach'
  //               }
  //             ],
  //             branchFalse: [
  //               {
  //                 type: 'action',
  //                 origin: { pluginId: 'system', nodeId: 'log' },
  //                 params: { message: "Folder: {{ steps[list-files-node]['outputs']['paths'] }}" },
  //                 uid: 'log-ko-in-foreach'
  //               }
  //             ]
  //           }
  //         ],
  //         uid: 'for-each-file'
  //       },
  //       {
  //         type: 'action',
  //         origin: { pluginId: 'system', nodeId: 'log' },
  //         uid: 'log-ok',
  //         params: { message: '{{ Filesystem.Join() }}' }
  //       }
  //     ])
  //   })

  //   it('insert at two level deep', () => {})

  //   it('insert at three level deep', () => {})

  //   it('insert in a loop', () => {})

  //   it('insert in a condition', () => {})
  // })
})
