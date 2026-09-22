import { join } from "node:path";
import { rename, rm } from "node:fs/promises";
import {
  parseReleaseConfig,
  type FileRepo,
  type ReleaseConfig,
  type SaveLocationWorkflow,
} from "@pipelab/shared";
import { PipelabContext } from "./context";
import { JsonFileMissingError, readJsonFile, writeJsonFileAtomically } from "./utils/atomic-json";
import { loadStrictProjects } from "./strict-config-persistence";

export class ReleasePersistenceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ReleasePersistenceError";
  }
}

const workflowPath = (context: PipelabContext, workflowId: string) =>
  context.getConfigPath("workflows", `${workflowId}.json`);

const loadProjects = async (context: PipelabContext): Promise<FileRepo> => {
  try {
    return await loadStrictProjects(context);
  } catch (error) {
    throw new ReleasePersistenceError(
      "Project index is invalid or uses an unsupported version.",
      error,
    );
  }
};

const findWorkflow = (repo: FileRepo, workflowId: string): SaveLocationWorkflow => {
  const workflow = repo.workflows?.find((candidate) => candidate.id === workflowId);
  if (!workflow)
    throw new ReleasePersistenceError(
      `Workflow '${workflowId}' is not present in the project index.`,
    );
  return workflow;
};

export class ReleasePersistence {
  constructor(private readonly context: PipelabContext) {}

  async load(workflowId: string, routeProjectId?: string): Promise<ReleaseConfig> {
    const repo = await loadProjects(this.context);
    const indexed = findWorkflow(repo, workflowId);
    if (!repo.projects.some((project) => project.id === indexed.project))
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' references missing project '${indexed.project}'.`,
      );
    if (routeProjectId !== undefined && routeProjectId !== indexed.project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' belongs to project '${indexed.project}', not '${routeProjectId}'.`,
      );
    const expectedName = `workflows/${workflowId}`;
    if (indexed.configName !== expectedName)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' has non-canonical configName '${indexed.configName}'.`,
      );
    let raw: unknown;
    try {
      raw = await readJsonFile(workflowPath(this.context, workflowId));
    } catch (error) {
      if (error instanceof JsonFileMissingError)
        throw new ReleasePersistenceError(`Workflow '${workflowId}' file is missing.`, error);
      throw error;
    }
    let config: ReleaseConfig;
    try {
      config = parseReleaseConfig(raw);
    } catch (error) {
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' has invalid persisted data.`,
        error,
      );
    }
    if (config.id !== indexed.id)
      throw new ReleasePersistenceError(
        `Workflow file identity '${config.id}' does not match index entry '${indexed.id}'.`,
      );
    if (config.project !== indexed.project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' project '${config.project}' does not match index project '${indexed.project}'.`,
      );
    return config;
  }

  async loadWithProject(workflowId: string, routeProjectId?: string) {
    const config = await this.load(workflowId, routeProjectId);
    const repo = await loadProjects(this.context);
    const project = repo.projects.find((candidate) => candidate.id === config.project);
    if (!project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' references missing project '${config.project}'.`,
      );
    return { config, project };
  }

  async save(config: ReleaseConfig, routeProjectId?: string): Promise<void> {
    const validated = parseReleaseConfig(config);
    const repo = await loadProjects(this.context);
    const indexed = repo.workflows?.find((candidate) => candidate.id === validated.id);
    if (!repo.projects.some((project) => project.id === validated.project))
      throw new ReleasePersistenceError(
        `Workflow '${validated.id}' references missing project '${validated.project}'.`,
      );
    if (routeProjectId !== undefined && routeProjectId !== validated.project)
      throw new ReleasePersistenceError(
        `Workflow '${validated.id}' belongs to project '${validated.project}', not '${routeProjectId}'.`,
      );
    if (indexed) {
      await this.load(validated.id, routeProjectId);
      if (indexed.project !== validated.project)
        throw new ReleasePersistenceError(
          `Workflow '${validated.id}' project cannot change during save.`,
        );
      if (indexed.configName !== `workflows/${validated.id}`)
        throw new ReleasePersistenceError(
          `Workflow '${validated.id}' has non-canonical configName '${indexed.configName}'.`,
        );
    }
    const file = workflowPath(this.context, validated.id);
    let previous: ReleaseConfig | undefined;
    try {
      previous = await this.load(validated.id);
    } catch (error) {
      if (indexed) throw error;
    }
    const nextRepo: FileRepo = {
      ...repo,
      workflows: [
        ...(repo.workflows || []).filter((candidate) => candidate.id !== validated.id),
        {
          id: validated.id,
          project: validated.project,
          lastModified: new Date().toISOString(),
          type: "internal-workflow",
          configName: `workflows/${validated.id}`,
        },
      ],
    };
    await writeJsonFileAtomically(file, validated);
    try {
      await writeJsonFileAtomically(this.context.getProjectsPath(), nextRepo);
    } catch (error) {
      if (previous) await writeJsonFileAtomically(file, previous);
      else await rm(file, { force: true });
      throw new ReleasePersistenceError(
        `Unable to update the workflow index for '${validated.id}'.`,
        error,
      );
    }
  }

  async delete(workflowId: string, routeProjectId?: string): Promise<void> {
    const repo = await loadProjects(this.context);
    const indexed = findWorkflow(repo, workflowId);
    if (routeProjectId !== undefined && routeProjectId !== indexed.project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' belongs to project '${indexed.project}', not '${routeProjectId}'.`,
      );
    await this.load(workflowId, routeProjectId);
    const file = workflowPath(this.context, workflowId);
    const snapshot = `${file}.deleting-${Date.now()}`;
    await rename(file, snapshot);
    try {
      await writeJsonFileAtomically(this.context.getProjectsPath(), {
        ...repo,
        workflows: (repo.workflows || []).filter((candidate) => candidate.id !== workflowId),
      });
      await rm(snapshot, { force: true });
    } catch (error) {
      await rename(snapshot, file).catch(() => undefined);
      throw new ReleasePersistenceError(
        `Unable to delete workflow '${workflowId}' without leaving stale references.`,
        error,
      );
    }
  }
}

export const getReleaseWorkflowPath = workflowPath;
