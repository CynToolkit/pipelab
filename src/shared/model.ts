import { Variable } from '@pipelab/core-app'
import { WithId } from './utils'
import { SaveLocation } from './save-location'
import { Simplify } from 'type-fest'
import { createMigration, createMigrator, finalVersion, initialVersion } from './libs/migration'
import {
  any,
  array,
  boolean,
  custom,
  GenericSchema,
  InferOutput,
  lazy,
  literal,
  object,
  optional,
  record,
  string,
  union,
  unknown,
  variant
} from 'valibot'
import type { OmitVersion } from './libs/migration/models/migration'

export type NodeId = string

export type Position = {
  x: number
  y: number
}

export const OriginValidator = object({
  pluginId: string(),
  nodeId: string()
})

export type Origin = InferOutput<typeof OriginValidator>

const BlockActionValidatorV1 = object({
  type: literal('action'),
  uid: string(),
  disabled: optional(boolean()),
  params: record(string(), any()),
  origin: OriginValidator
})

export const EditorParamValidatorV3 = union([literal('simple'), literal('editor')])
export type EditorParam = InferOutput<typeof EditorParamValidatorV3>
const BlockActionValidatorV3 = object({
  type: literal('action'),
  uid: string(),
  disabled: optional(boolean()),
  params: record(
    string(),
    object({
      editor: EditorParamValidatorV3,
      value: unknown()
    })
  ),
  origin: OriginValidator
})

export type Condition = {
  type: 'condition'
  uid: string
  origin: Origin
  params: Record<string, any>
  branchTrue: Array<Block>
  branchFalse: Array<Block>
}

const BlockConditionValidator: GenericSchema<Condition> = object({
  type: literal('condition'),
  uid: string(),
  origin: OriginValidator,
  params: record(string(), any()),
  branchTrue: lazy(() => array(BlockValidator)),
  branchFalse: lazy(() => array(BlockValidator))
})

export type Loop = {
  type: 'loop'
  uid: string
  origin: Origin
  params: Record<string, any>
  children: Array<Block>
}
const BlockLoopValidator: GenericSchema<Loop> = object({
  type: literal('loop'),
  uid: string(),
  origin: OriginValidator,
  params: record(string(), any()),
  children: lazy(() => array(BlockValidator))
})

const BlockEventValidator = object({
  type: literal('event'),
  uid: string(),
  origin: OriginValidator,
  params: record(string(), any())
})

const BlockCommentValidator = object({
  type: literal('comment'),
  uid: string(),
  origin: OriginValidator,
  comment: string()
})

const BlockValidatorV1 = variant('type', [
  BlockActionValidatorV1,
  // BlockConditionValidator,
  BlockEventValidator
  // BlockLoopValidator,
  // BlockCommentValidator
])

const BlockValidatorV2 = variant('type', [
  BlockActionValidatorV1
  // BlockConditionValidator,
  // BlockEventValidator,
  // BlockLoopValidator,
  // BlockCommentValidator
])

const BlockValidatorV3 = variant('type', [
  BlockActionValidatorV3
  // BlockConditionValidator,
  // BlockEventValidator,
  // BlockLoopValidator,
  // BlockCommentValidator
])

const BlockValidator = BlockValidatorV3

export type BlockAction = Simplify<InferOutput<typeof BlockActionValidatorV3>>
export type BlockCondition = InferOutput<typeof BlockConditionValidator>
export type BlockLoop = InferOutput<typeof BlockLoopValidator>
export type BlockEvent = InferOutput<typeof BlockEventValidator>
export type BlockComment = InferOutput<typeof BlockCommentValidator>

export type Block = InferOutput<typeof BlockValidatorV3>

const CanvasValidatorV1 = object({
  blocks: array(BlockValidatorV1)
})

const CanvasValidatorV2 = object({
  blocks: array(BlockValidatorV2),
  triggers: array(BlockEventValidator)
})

const CanvasValidatorV3 = object({
  blocks: array(BlockValidatorV3),
  triggers: array(BlockEventValidator)
})

const VariableValidatorV1 = custom<Variable>(() => true)

export const SavedFileValidatorV1 = object({
  version: literal('1.0.0'),
  name: string(),
  description: string(),
  canvas: CanvasValidatorV1,
  variables: array(VariableValidatorV1)
})

export const SavedFileValidatorV2 = object({
  version: literal('2.0.0'),
  name: string(),
  description: string(),
  canvas: CanvasValidatorV2,
  variables: array(VariableValidatorV1)
})

export const SavedFileValidatorV3 = object({
  version: literal('3.0.0'),
  name: string(),
  description: string(),
  canvas: CanvasValidatorV3,
  variables: array(VariableValidatorV1)
})

export type SavedFileV1 = InferOutput<typeof SavedFileValidatorV1>
export type SavedFileV2 = InferOutput<typeof SavedFileValidatorV2>
export type SavedFileV3 = InferOutput<typeof SavedFileValidatorV3>
export type SavedFile = SavedFileV3

export const savedFileMigrator = createMigrator<SavedFile>({
  migrations: [
    createMigration<never, SavedFileV1, SavedFileV2>({
      version: '1.0.0',
      up: (state) => {
        const blocks = state.canvas.blocks

        const triggers: Array<BlockEvent> = []
        const newBlocks: Array<Block> = []

        for (const block of blocks) {
          if (block.type === 'event') {
            // add to triggers
            triggers.push(block)
          } else {
            // restore in blocks because it's not a trigger
            newBlocks.push(block)
          }
        }

        return {
          canvas: {
            blocks: newBlocks,
            triggers: triggers
          },
          description: state.description,
          name: state.name,
          variables: state.variables
        } satisfies OmitVersion<SavedFileV2>
      },
      down: initialVersion
    }),
    createMigration<SavedFileV1, SavedFileV2, SavedFileV3>({
      version: '2.0.0',
      up: (state) => {
        const { canvas, ...rest } = state
        const { blocks, triggers } = canvas

        const newBlocks: SavedFileV2['canvas']['blocks'] = []

        for (const block of blocks) {
          const newParams: SavedFileV2['canvas']['blocks'][number]['params'] = {}

          for (const data of Object.entries(block.params)) {
            console.log('data', data)
            if (data === undefined) {
              throw new Error("Can't migrate block with undefined params")
            } else {
              const [key, value] = data
              newParams[key] = {
                editor: 'editor',
                value
              }
            }
          }

          newBlocks.push({
            ...block,
            params: newParams
          })
        }

        return {
          ...rest,
          canvas: {
            triggers,
            blocks: newBlocks
          }
        } satisfies OmitVersion<SavedFileV2>
      },
      down: () => {
        throw new Error('Migration down not implemented')
      }
    }),
    createMigration<SavedFileV2, SavedFileV3, never>({
      version: '3.0.0',
      up: finalVersion,
      down: () => {
        throw new Error('Migration down not implemented')
      }
    })
  ]
})

export type PresetFn = () => Promise<{ data: SavedFile }>
export type Preset = SavedFile

export type Steps = Record<
  string,
  {
    outputs: Record<string, unknown>
  }
>

export type EnhancedFile = WithId<SaveLocation> & { content: SavedFile }
