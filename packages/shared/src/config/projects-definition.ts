import { SaveLocationValidator } from "../save-location";
import { object, string, optional, record, InferInput, literal, array } from "valibot";

export const FileRepoValidatorV1 = object({
  version: literal("1.0.0"),
  data: optional(record(string(), SaveLocationValidator), {}),
});

export const FileRepoProjectValidatorV2 = object({
  id: string(),
  name: string(),
  description: string(),
});

export const SaveLocationReleaseFlowValidator = object({
  id: string(),
  project: string(),
  lastModified: string(),
  type: literal("internal-release-flow"),
  configName: string(),
});

export const FileRepoValidatorV2 = object({
  version: literal("2.0.0"),
  projects: array(FileRepoProjectValidatorV2),
  pipelines: optional(array(SaveLocationValidator), []),
});

export const FileRepoValidatorV3 = object({
  version: literal("3.0.0"),
  projects: array(FileRepoProjectValidatorV2),
  pipelines: optional(array(SaveLocationValidator), []),
  releaseFlows: optional(array(SaveLocationReleaseFlowValidator), []),
});

export type SaveLocationReleaseFlow = InferInput<typeof SaveLocationReleaseFlowValidator>;

export type FileRepoV1 = InferInput<typeof FileRepoValidatorV1>;
export type FileRepoV2 = InferInput<typeof FileRepoValidatorV2>;
export type FileRepoV3 = InferInput<typeof FileRepoValidatorV3>;

export const FileRepoValidator = FileRepoValidatorV3;
export type FileRepo = InferInput<typeof FileRepoValidator>;
