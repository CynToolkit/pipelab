import { SaveLocationValidator } from "../save-location";
import { object, string, optional, record, InferInput, literal, array } from "valibot";
import { isSafePersistedId } from "../persisted-id";

export const FileRepoValidatorV1 = object({
  version: literal("1.0.0"),
  data: optional(record(string(), SaveLocationValidator), {}),
});

export const FileRepoProjectValidatorV2 = object({
  id: string(),
  name: string(),
  description: string(),
});

export const SaveLocationWorkflowValidator = object({
  id: string(),
  project: string(),
  lastModified: string(),
  type: literal("internal-workflow"),
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
  workflows: optional(array(SaveLocationWorkflowValidator), []),
});

export type SaveLocationWorkflow = InferInput<typeof SaveLocationWorkflowValidator>;

export type FileRepoV1 = InferInput<typeof FileRepoValidatorV1>;
export type FileRepoV2 = InferInput<typeof FileRepoValidatorV2>;
export type FileRepoV3 = InferInput<typeof FileRepoValidatorV3>;

export const FileRepoValidator = FileRepoValidatorV3;
export type FileRepo = InferInput<typeof FileRepoValidator>;

export class FileRepoParseError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "FileRepoParseError";
  }
}

const assertFileRepo: (value: unknown) => asserts value is FileRepo = (value) => {
  const issues: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new FileRepoParseError(["Project index must be an object."]);
  const record = value as Record<string, unknown>;
  if (record.version !== "3.0.0") issues.push("Only project index version 3.0.0 is supported.");
  if (!Array.isArray(record.projects)) issues.push("projects must be an array.");
  if (!Array.isArray(record.pipelines)) issues.push("pipelines must be an array.");
  if (record.workflows !== undefined && !Array.isArray(record.workflows))
    issues.push("workflows must be an array.");
  const projectIds = new Set<string>();
  for (const [index, project] of (Array.isArray(record.projects)
    ? record.projects
    : []
  ).entries()) {
    if (typeof project !== "object" || project === null || Array.isArray(project)) {
      issues.push(`projects.${index} must be an object.`);
      continue;
    }
    const candidate = project as Record<string, unknown>;
    for (const key of ["id", "name"])
      if (typeof candidate[key] !== "string" || candidate[key].trim().length === 0)
        issues.push(`projects.${index}.${key} must be non-empty.`);
    if (typeof candidate.description !== "string")
      issues.push(`projects.${index}.description must be a string.`);
    if (typeof candidate.id === "string") {
      if (!isSafePersistedId(candidate.id))
        issues.push(`projects.${index}.id must be a safe non-empty persisted ID.`);
      if (projectIds.has(candidate.id)) issues.push(`Project ID '${candidate.id}' is duplicated.`);
      projectIds.add(candidate.id);
    }
  }
  const workflowIds = new Set<string>();
  for (const [index, workflow] of (Array.isArray(record.workflows)
    ? record.workflows
    : []
  ).entries()) {
    if (typeof workflow !== "object" || workflow === null || Array.isArray(workflow)) {
      issues.push(`workflows.${index} must be an object.`);
      continue;
    }
    const candidate = workflow as Record<string, unknown>;
    for (const key of ["id", "project", "lastModified", "configName"])
      if (typeof candidate[key] !== "string" || candidate[key].trim().length === 0)
        issues.push(`workflows.${index}.${key} must be non-empty.`);
    if (typeof candidate.id === "string") {
      if (!isSafePersistedId(candidate.id))
        issues.push(`workflows.${index}.id must be a safe non-empty persisted ID.`);
      if (workflowIds.has(candidate.id))
        issues.push(`Workflow ID '${candidate.id}' is duplicated.`);
      workflowIds.add(candidate.id);
      if (candidate.configName !== `workflows/${candidate.id}`)
        issues.push(`Workflow '${candidate.id}' must use its canonical configName.`);
    }
    if (typeof candidate.project === "string" && !projectIds.has(candidate.project))
      issues.push(`Workflow '${candidate.id}' references missing project '${candidate.project}'.`);
  }
  if (issues.length > 0) throw new FileRepoParseError(issues);
};

export const parseFileRepo = (value: unknown): FileRepo => {
  assertFileRepo(value);
  return value;
};
