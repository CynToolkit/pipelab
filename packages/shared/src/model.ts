import { Variable } from "./variables";
import { WithId } from "./utils";
import { SaveLocation } from "./save-location";
import type { Simplify } from "type-fest";
import {
  any,
  array,
  boolean,
  custom,
  description,
  GenericSchema,
  InferOutput,
  lazy,
  literal,
  object,
  optional,
  pipe,
  record,
  string,
  union,
  unknown,
  variant,
} from "valibot";

export type NodeId = string;

export type Position = {
  x: number;
  y: number;
};

export const OriginValidator = object({
  pluginId: string(),
  nodeId: string(),
});

export type Origin = InferOutput<typeof OriginValidator>;

const BlockActionValidatorV1 = object({
  type: literal("action"),
  uid: string(),
  disabled: optional(boolean()),
  params: record(string(), any()),
  origin: OriginValidator,
});

export const EditorParamValidatorV3 = union([literal("simple"), literal("editor")]);
export type EditorParam = InferOutput<typeof EditorParamValidatorV3>;
const BlockActionValidatorV3 = object({
  type: literal("action"),
  uid: string(),
  name: pipe(optional(string()), description("A custom name provided by the user")),
  disabled: optional(boolean()),
  params: record(
    string(),
    object({
      editor: EditorParamValidatorV3,
      value: unknown(),
    }),
  ),
  origin: OriginValidator,
});

export type BlockCondition = {
  type: "condition";
  uid: string;
  origin: Origin;
  params: Record<string, any>;
  branchTrue: Array<Block>;
  branchFalse: Array<Block>;
};

const BlockConditionValidator: GenericSchema<BlockCondition> = object({
  type: literal("condition"),
  uid: string(),
  origin: OriginValidator,
  params: record(string(), any()),
  branchTrue: lazy(() => array(BlockValidator)),
  branchFalse: lazy(() => array(BlockValidator)),
});

export type BlockLoop = {
  type: "loop";
  uid: string;
  origin: Origin;
  params: Record<string, any>;
  children: Array<Block>;
};
const BlockLoopValidator: GenericSchema<BlockLoop> = object({
  type: literal("loop"),
  uid: string(),
  origin: OriginValidator,
  params: record(string(), any()),
  children: lazy(() => array(BlockValidator)),
});

const BlockEventValidator = object({
  type: literal("event"),
  uid: string(),
  origin: OriginValidator,
  params: record(string(), any()),
});

const BlockCommentValidator = object({
  type: literal("comment"),
  uid: string(),
  origin: OriginValidator,
  comment: string(),
});

const BlockValidatorV1 = variant("type", [
  BlockActionValidatorV1,
  // BlockConditionValidator,
  BlockEventValidator,
  // BlockLoopValidator,
  // BlockCommentValidator
]);

const BlockValidatorV2 = variant("type", [
  BlockActionValidatorV1,
  // BlockConditionValidator,
  // BlockEventValidator,
  // BlockLoopValidator,
  // BlockCommentValidator
]);

const BlockValidatorV3 = variant("type", [
  BlockActionValidatorV3,
  // BlockConditionValidator,
  // BlockEventValidator,
  // BlockLoopValidator,
  // BlockCommentValidator
]);

const BlockValidator = BlockValidatorV3;

export type BlockAction = Simplify<InferOutput<typeof BlockActionValidatorV3>>;
export type BlockEvent = InferOutput<typeof BlockEventValidator>;
export type BlockComment = InferOutput<typeof BlockCommentValidator>;

export type Block = InferOutput<typeof BlockValidatorV3>;

const CanvasValidatorV1 = object({
  blocks: array(BlockValidatorV1),
});

const CanvasValidatorV2 = object({
  blocks: array(BlockValidatorV2),
  triggers: array(BlockEventValidator),
});

const CanvasValidatorV3 = object({
  blocks: array(BlockValidatorV3),
  triggers: array(BlockEventValidator),
});

export const VariableValidatorV1 = custom<Variable>(() => true);

export const SavedFileValidatorV1 = object({
  version: literal("1.0.0"),
  name: string(),
  description: string(),
  canvas: CanvasValidatorV1,
  variables: array(VariableValidatorV1),
});

export const SavedFileValidatorV2 = object({
  version: literal("2.0.0"),
  name: string(),
  description: string(),
  canvas: CanvasValidatorV2,
  variables: array(VariableValidatorV1),
});

export const SavedFileValidatorV3 = object({
  version: literal("3.0.0"),
  name: string(),
  description: string(),
  canvas: CanvasValidatorV3,
  variables: array(VariableValidatorV1),
});

export const SavedFileDefaultValidator = object({
  version: literal("4.0.0"),
  type: literal("default"),
  name: string(),
  description: string(),
  canvas: CanvasValidatorV3,
  variables: array(VariableValidatorV1),
});

export const SavedFileSimpleValidator = object({
  version: literal("4.0.0"),
  type: literal("simple"),
  name: string(),
  description: string(),
  source: object({
    type: union([literal("c3-html"), literal("c3-nwjs"), literal("godot"), literal("html")]),
    path: string(),
  }),
  packaging: object({
    enabled: boolean(),
  }),
  publishing: object({
    steam: object({ enabled: boolean(), appId: optional(string()) }),
    itch: object({ enabled: boolean(), project: optional(string()) }),
    poki: object({ enabled: boolean(), gameId: optional(string()) }),
  }),
});

export type SavedFileDefault = InferOutput<typeof SavedFileDefaultValidator>;
export type SavedFileSimple = InferOutput<typeof SavedFileSimpleValidator>;
export const SavedFileValidatorV4 = union([SavedFileDefaultValidator, SavedFileSimpleValidator]);

export type SavedFileV1 = InferOutput<typeof SavedFileValidatorV1>;
export type SavedFileV2 = InferOutput<typeof SavedFileValidatorV2>;
export type SavedFileV3 = InferOutput<typeof SavedFileValidatorV3>;
export type SavedFileV4 = InferOutput<typeof SavedFileValidatorV4>;
export type SavedFile = SavedFileV4;
export const SavedFileValidator = SavedFileValidatorV4;

export type Preset = SavedFile;
export type PresetResult = { data: SavedFile; hightlight?: boolean; disabled?: boolean };
export type PresetFn = () => Promise<PresetResult>;

export type Steps = Record<
  string,
  {
    outputs: Record<string, unknown>;
  }
>;

export type EnhancedFile<T extends SavedFile = SavedFile> = WithId<SaveLocation> & { content: T };
