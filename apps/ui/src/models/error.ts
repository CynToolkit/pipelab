import { any, literal, object, optional, record, string, union, type InferOutput } from "valibot";

export const ValidationErrorValidator = object({
  type: union([literal("missing"), literal("blacklisted")]),
  param: string(),
  message: optional(string()),
  meta: optional(record(string(), any())),
});

export type ValidationError = InferOutput<typeof ValidationErrorValidator>;
