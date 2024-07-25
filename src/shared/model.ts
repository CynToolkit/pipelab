import { Variable } from '@cyn/core'
import { WithId } from './utils'
import { SaveLocation } from './save-location'
import { Simplify } from 'type-fest'
import { createMigration, createMigrator, finalVersion, initialVersion } from './libs/migration'
import { any, array, custom, GenericSchema, InferOutput, lazy, literal, object, record, string, union, variant } from 'valibot'
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

const BlockActionValidator = object({
  type: literal('action'),
  uid: string(),
  params: record(string(), any()),
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
  BlockActionValidator,
  // BlockConditionValidator,
  BlockEventValidator,
  // BlockLoopValidator,
  // BlockCommentValidator
])

const BlockValidatorV2 = variant('type', [
  BlockActionValidator,
  // BlockConditionValidator,
  // BlockEventValidator,
  // BlockLoopValidator,
  // BlockCommentValidator
])

const BlockValidator = BlockValidatorV2

export type BlockAction = Simplify<InferOutput<typeof BlockActionValidator>>
export type BlockCondition = InferOutput<typeof BlockConditionValidator>
export type BlockLoop = InferOutput<typeof BlockLoopValidator>
export type BlockEvent = InferOutput<typeof BlockEventValidator>
export type BlockComment = InferOutput<typeof BlockCommentValidator>

export type Block = InferOutput<typeof BlockValidatorV2>

const CanvasValidatorV1 = object({
  blocks: array(BlockValidatorV1)
})

const CanvasValidatorV2 = object({
  blocks: array(BlockValidatorV2),
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

export type SavedFileV1 = InferOutput<typeof SavedFileValidatorV1>
export type SavedFileV2 = InferOutput<typeof SavedFileValidatorV2>
export type SavedFile = SavedFileV2

export const savedFileMigrator = createMigrator<SavedFile>({
  migrations: [
    createMigration<never, SavedFileV1, SavedFileV2>({
      version: '1.0.0',
      up: (state) => {
        const blocks = state.canvas.blocks

        const triggers: Array<BlockEvent> = []
        const newBlocks: Array<Block> = []

        for (const block of blocks) {
          if (block.type === "event") {
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
            triggers: triggers,
          },
          description: state.description,
          name: state.name,
          variables: state.variables,
        } satisfies OmitVersion<SavedFileV2>;
      },
      down: initialVersion,
    }),
    createMigration<SavedFileV1, SavedFileV2, never>({
      version: '2.0.0',
      up: finalVersion,
      down: (state) => {
        throw new Error('Migration down not implemented')
      },
    }),
  ],
});

export type PresetFn = () => Promise<{ data: SavedFile; }>
export type Preset = SavedFile

export type Steps = Record<
  string,
  {
    outputs: Record<string, unknown>
  }
>

export type EnhancedFile = WithId<SaveLocation> & { content: SavedFile }
