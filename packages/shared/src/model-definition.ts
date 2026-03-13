import { SaveLocation } from "./save-location";
import { WithId } from "./utils";
import { Variable } from "@pipelab/core-app";
import {
  any,
  array,
  boolean,
  custom,
  InferOutput,
  literal,
  object,
  optional,
  string,
  union,
  record,
} from "valibot";

export const BlockParamValidatorV1 = any();
export const BlockParamValidatorV2 = object({
  editor: string(),
  value: any(),
});

export const BlockValidatorV1 = object({
  id: string(),
  name: string(),
  params: record(string(), BlockParamValidatorV1),
});

export const BlockValidatorV2 = object({
  id: string(),
  name: string(),
  params: record(string(), BlockParamValidatorV2),
});

export const BlockValidatorV3 = object({
  id: string(),
  name: string(),
  params: record(string(), BlockParamValidatorV2),
  type: string(),
});

export const BlockEventValidator = any();

export const CanvasValidatorV1 = object({
  blocks: array(BlockValidatorV1),
});

export const CanvasValidatorV2 = object({
  blocks: array(BlockValidatorV2),
});

export const CanvasValidatorV3 = object({
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
