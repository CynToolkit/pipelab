import { z } from 'zod'
import { Variable } from '@cyn/core'
import { WithId } from './utils'
import { SaveLocation } from './save-location'

export type NodeId = string

export type Position = {
  x: number
  y: number
}

/* export const NodeValidator = <ID extends NodeId>() => z.object({
    id: z.custom<ID>(),
    uid: z.string(),
    position: z.custom<Position>(),
    data: z.custom<GetNodeDataType<InstanceType<(typeof nodes)[ID]>>>()
}) */

// export const NodeValidator = <ID extends NodeId>() => z.object({
//     id: z.custom<ID>(),
//     uid: z.string(),
//     position: z.custom<Position>(),
//     data: z.custom<GetNodeDataType<InstanceType<(typeof nodes)[ID]>>>()
// })

export const OriginValidator = z.object({
  pluginId: z.string(),
  nodeId: z.string()
})

export type Origin = z.infer<typeof OriginValidator>

const BlockActionValidator = z.object({
  type: z.literal('action'),
  uid: z.string(),
  params: z.record(z.string(), z.any()),
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

// @ts-expect-error
const BlockConditionValidator: z.ZodType<Condition> = z.object({
  type: z.literal('condition'),
  uid: z.string(),
  origin: OriginValidator,
  params: z.record(z.string(), z.any()),
  branchTrue: z.lazy(() => z.array(BlockValidator)),
  branchFalse: z.lazy(() => z.array(BlockValidator))
})

export type Loop = {
  type: 'loop'
  uid: string
  origin: Origin
  params: Record<string, any>
  children: Array<Block>
}
// @ts-expect-error
const BlockLoopValidator: z.ZodType<Loop> = z.object({
  type: z.literal('loop'),
  uid: z.string(),
  origin: OriginValidator,
  params: z.record(z.string(), z.any()),
  children: z.lazy(() => z.array(BlockValidator))
})

const BlockEventValidator = z.object({
  type: z.literal('event'),
  uid: z.string(),
  origin: OriginValidator,
  params: z.record(z.string(), z.any())
})

const BlockCommentValidator = z.object({
  type: z.literal('comment'),
  uid: z.string(),
  origin: OriginValidator,
  comment: z.string()
})

const BlockValidator = z.union([
  BlockActionValidator,
  BlockConditionValidator,
  BlockEventValidator,
  BlockLoopValidator,
  BlockCommentValidator
])

export type BlockAction = z.infer<typeof BlockActionValidator>
export type BlockCondition = z.infer<typeof BlockConditionValidator>
export type BlockLoop = z.infer<typeof BlockLoopValidator>
export type BlockEvent = z.infer<typeof BlockEventValidator>
export type BlockComment = z.infer<typeof BlockCommentValidator>

export type Block = z.infer<typeof BlockValidator>

const CanvasValidator = z.object({
  blocks: z.array(BlockValidator)
})

const VariableValidator = z.custom<Variable>()

export const SavedFileValidatorV1 = z.object({
  version: z.literal('1.0.0'),
  name: z.string(),
  description: z.string(),
  canvas: CanvasValidator,
  variables: z.array(VariableValidator)
})

export type SavedFileV1 = z.infer<typeof SavedFileValidatorV1>
export type SavedFile = SavedFileV1

export type PresetFn = () => Promise<{ data: SavedFile; }>
export type Preset = SavedFile

export type Steps = Record<
  string,
  {
    outputs: Record<string, unknown>
  }
>

export type EnhancedFile = WithId<SaveLocation> & { content: SavedFile }
