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

export const FileRepoValidatorV2 = object({
  version: literal("2.0.0"),
  projects: array(FileRepoProjectValidatorV2),
  pipelines: optional(array(SaveLocationValidator), []),
});

export type FileRepoV1 = InferInput<typeof FileRepoValidatorV1>;
export type FileRepoV2 = InferInput<typeof FileRepoValidatorV2>;

export const FileRepoValidator = FileRepoValidatorV2;
export type FileRepo = InferInput<typeof FileRepoValidator>;
