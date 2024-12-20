import { describe, expect, it } from 'vitest'
import { savedFileMigrator, SavedFileV1, SavedFileV2, SavedFileV3 } from './model'

describe('model', () => {
  it('should migrate 1.0.0 to 2.0.0', async () => {
    const v1: SavedFileV1 = {
      version: '1.0.0',
      canvas: {
        blocks: [
          {
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                foo: 'bar'
              },
              nodata: undefined
            },
            type: 'action',
            uid: 'aaa',
            disabled: false
          },
          {
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                foo: 'bar'
              }
            },
            type: 'event',
            uid: 'aaa'
          }
        ]
      },
      description: 'aaa',
      name: 'aaa',
      variables: [
        {
          description: 'aaa',
          id: 'aaa',
          name: 'aaa',
          value: 'aaa'
        }
      ]
    }

    const v2 = await savedFileMigrator.migrate(v1, {
      debug: true,
      target: '2.0.0'
    })

    expect(v2).toStrictEqual({
      canvas: {
        blocks: [
          {
            disabled: false,
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                foo: 'bar'
              },
              nodata: undefined
            },
            type: 'action',
            uid: 'aaa'
          }
        ],
        triggers: [
          {
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                foo: 'bar'
              }
            },
            type: 'event',
            uid: 'aaa'
          }
        ]
      },
      description: 'aaa',
      name: 'aaa',
      variables: [
        {
          description: 'aaa',
          id: 'aaa',
          name: 'aaa',
          value: 'aaa'
        }
      ],
      version: '2.0.0'
    } satisfies SavedFileV2)
  })

  it('should migrate 2.0.0 to 3.0.0', async () => {
    const v2: SavedFileV2 = {
      canvas: {
        blocks: [
          {
            disabled: false,
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                foo: 'bar'
              },
              nodata: undefined
            },
            type: 'action',
            uid: 'aaa'
          }
        ],
        triggers: [
          {
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                foo: 'bar'
              }
            },
            type: 'event',
            uid: 'aaa'
          }
        ]
      },
      description: 'aaa',
      name: 'aaa',
      variables: [
        {
          description: 'aaa',
          id: 'aaa',
          name: 'aaa',
          value: 'aaa'
        }
      ],
      version: '2.0.0'
    }

    const v3 = await savedFileMigrator.migrate(v2, {
      debug: true,
      target: '3.0.0'
    })

    expect(v3).toStrictEqual({
      canvas: {
        blocks: [
          {
            disabled: false,
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                editor: 'editor',
                value: {
                  foo: 'bar'
                }
              },
              nodata: {
                editor: 'editor',
                value: undefined
              }
            },
            type: 'action',
            uid: 'aaa'
          }
        ],
        triggers: [
          {
            origin: {
              nodeId: 'aaa',
              pluginId: 'aaa'
            },
            params: {
              aaa: {
                foo: 'bar'
              }
            },
            type: 'event',
            uid: 'aaa'
          }
        ]
      },
      description: 'aaa',
      name: 'aaa',
      variables: [
        {
          description: 'aaa',
          id: 'aaa',
          name: 'aaa',
          value: 'aaa'
        }
      ],
      version: '3.0.0'
    } satisfies SavedFileV3)
  })
})
