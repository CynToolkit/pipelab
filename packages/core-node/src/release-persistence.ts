import { rename, rm, stat } from "node:fs/promises";
import {
  parseReleaseConfig,
  isSafePersistedId,
  buildReleaseRegistry,
  validateReleaseConnectionReferences,
  usePlugins,
  type ConnectionsConfig,
  type FileRepo,
  type ReleaseRegistry,
  type ReleaseConfig,
  type SaveLocationWorkflow,
  useLogger,
} from "@pipelab/shared";
import { PipelabContext } from "./context";
import { JsonFileMissingError, readJsonFile, writeJsonFileAtomically } from "./utils/atomic-json";
import { loadStrictConnections, loadStrictProjects } from "./strict-config-persistence";
import { serializeFileMutation } from "./release-persistence-lock";

export type ReleasePersistenceErrorCode =
  | "unsafe-id"
  | "index-invalid"
  | "not-found"
  | "missing-file"
  | "invalid-config"
  | "identity-mismatch"
  | "invalid-reference"
  | "transaction-failed";

export class ReleasePersistenceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly code: ReleasePersistenceErrorCode = "index-invalid",
  ) {
    super(message);
    this.name = "ReleasePersistenceError";
  }
}

type ReleasePersistenceFileOps = {
  rename: typeof rename;
  rm: typeof rm;
};

export interface LoadedReleaseWorkflow {
  config: ReleaseConfig;
  index: SaveLocationWorkflow;
  project: FileRepo["projects"][number];
  connections: ConnectionsConfig;
  registry: ReleaseRegistry;
}

const workflowPath = (context: PipelabContext, workflowId: string) =>
  context.getConfigPath("workflows", `${workflowId}.json`);

const assertSafeWorkflowId = (workflowId: string): void => {
  if (!isSafePersistedId(workflowId))
    throw new ReleasePersistenceError(
      `Workflow ID '${workflowId}' is not safe for persistence.`,
      undefined,
      "unsafe-id",
    );
};

const loadProjects = async (context: PipelabContext): Promise<FileRepo> => {
  try {
    return await loadStrictProjects(context);
  } catch (error) {
    throw new ReleasePersistenceError(
      `Project index is invalid or uses an unsupported version: ${error instanceof Error ? error.message : String(error)}`,
      error,
      "index-invalid",
    );
  }
};

const findWorkflow = (repo: FileRepo, workflowId: string): SaveLocationWorkflow => {
  const workflow = repo.workflows?.find((candidate) => candidate.id === workflowId);
  if (!workflow)
    throw new ReleasePersistenceError(
      `Workflow '${workflowId}' is not present in the project index.`,
      undefined,
      "not-found",
    );
  return workflow;
};

export class ReleasePersistence {
  constructor(
    private readonly context: PipelabContext,
    private readonly writeJson: typeof writeJsonFileAtomically = writeJsonFileAtomically,
    private readonly fileOps: ReleasePersistenceFileOps = { rename, rm },
    private readonly pluginsReady: Promise<void> = Promise.resolve(),
  ) {}

  async load(workflowId: string, routeProjectId?: string): Promise<ReleaseConfig> {
    assertSafeWorkflowId(workflowId);
    const repo = await loadProjects(this.context);
    const indexed = findWorkflow(repo, workflowId);
    if (!repo.projects.some((project) => project.id === indexed.project))
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' references missing project '${indexed.project}'.`,
        undefined,
        "identity-mismatch",
      );
    if (routeProjectId !== undefined && routeProjectId !== indexed.project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' belongs to project '${indexed.project}', not '${routeProjectId}'.`,
        undefined,
        "identity-mismatch",
      );
    const expectedName = `workflows/${workflowId}`;
    if (indexed.configName !== expectedName)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' has non-canonical configName '${indexed.configName}'.`,
        undefined,
        "identity-mismatch",
      );
    let raw: unknown;
    try {
      raw = await readJsonFile(workflowPath(this.context, workflowId));
    } catch (error) {
      if (error instanceof JsonFileMissingError)
        throw new ReleasePersistenceError(
          `Workflow '${workflowId}' file is missing.`,
          error,
          "missing-file",
        );
      throw error;
    }
    let config: ReleaseConfig;
    try {
      config = parseReleaseConfig(raw);
    } catch (error) {
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' has invalid persisted data: ${error instanceof Error ? error.message : String(error)}`,
        error,
        "invalid-config",
      );
    }
    if (config.id !== indexed.id)
      throw new ReleasePersistenceError(
        `Workflow file identity '${config.id}' does not match index entry '${indexed.id}'.`,
        undefined,
        "identity-mismatch",
      );
    if (config.project !== indexed.project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' project '${config.project}' does not match index project '${indexed.project}'.`,
        undefined,
        "identity-mismatch",
      );
    return config;
  }

  async loadWithProject(
    workflowId: string,
    routeProjectId?: string,
  ): Promise<LoadedReleaseWorkflow> {
    await this.pluginsReady;
    const config = await this.load(workflowId, routeProjectId);
    const repo = await loadProjects(this.context);
    const index = findWorkflow(repo, workflowId);
    const project = repo.projects.find((candidate) => candidate.id === config.project);
    if (!project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' references missing project '${config.project}'.`,
        undefined,
        "identity-mismatch",
      );
    const connections = await loadStrictConnections(this.context);
    const registry = buildReleaseRegistry(usePlugins().plugins.value);
    const connectionIssues = validateReleaseConnectionReferences(config, registry, connections);
    if (connectionIssues.length)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' has invalid connection references: ${connectionIssues
          .map((issue) => issue.message)
          .join(" ")}`,
        undefined,
        "invalid-reference",
      );
    return { config, index, project, connections, registry };
  }

  async save(config: ReleaseConfig, routeProjectId?: string): Promise<void> {
    return serializeFileMutation(this.context.getProjectsPath(), () =>
      this.saveUnlocked(config, routeProjectId),
    );
  }

  private async saveUnlocked(config: ReleaseConfig, routeProjectId?: string): Promise<void> {
    await this.pluginsReady;
    const validated = parseReleaseConfig(config);
    assertSafeWorkflowId(validated.id);
    const registry = buildReleaseRegistry(usePlugins().plugins.value);
    const connectionIssues = validateReleaseConnectionReferences(
      validated,
      registry,
      await loadStrictConnections(this.context),
    );
    if (connectionIssues.length)
      throw new ReleasePersistenceError(
        `Workflow '${validated.id}' has invalid connection references: ${connectionIssues
          .map((issue) => issue.message)
          .join(" ")}`,
        undefined,
        "invalid-reference",
      );
    const repo = await loadProjects(this.context);
    const indexed = repo.workflows?.find((candidate) => candidate.id === validated.id);
    if (!repo.projects.some((project) => project.id === validated.project))
      throw new ReleasePersistenceError(
        `Workflow '${validated.id}' references missing project '${validated.project}'.`,
      );
    if (routeProjectId !== undefined && routeProjectId !== validated.project)
      throw new ReleasePersistenceError(
        `Workflow '${validated.id}' belongs to project '${validated.project}', not '${routeProjectId}'.`,
        undefined,
        "identity-mismatch",
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
      try {
        await stat(file);
        throw new ReleasePersistenceError(
          `Cannot create workflow '${validated.id}': an orphaned workflow file already exists.`,
        );
      } catch (fileError) {
        if (fileError instanceof ReleasePersistenceError) throw fileError;
        if ((fileError as NodeJS.ErrnoException).code !== "ENOENT") throw fileError;
      }
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
    await this.writeJson(file, validated);
    try {
      await this.writeJson(this.context.getProjectsPath(), nextRepo);
    } catch (error) {
      if (previous) await this.writeJson(file, previous);
      else await rm(file, { force: true });
      throw new ReleasePersistenceError(
        `Unable to update the workflow index for '${validated.id}'.`,
        error,
        "transaction-failed",
      );
    }
  }

  async delete(workflowId: string, routeProjectId?: string): Promise<void> {
    return serializeFileMutation(this.context.getProjectsPath(), () =>
      this.deleteUnlocked(workflowId, routeProjectId),
    );
  }

  private async deleteUnlocked(workflowId: string, routeProjectId?: string): Promise<void> {
    assertSafeWorkflowId(workflowId);
    const repo = await loadProjects(this.context);
    const indexed = findWorkflow(repo, workflowId);
    if (routeProjectId !== undefined && routeProjectId !== indexed.project)
      throw new ReleasePersistenceError(
        `Workflow '${workflowId}' belongs to project '${indexed.project}', not '${routeProjectId}'.`,
      );
    await this.load(workflowId, routeProjectId);
    const file = workflowPath(this.context, workflowId);
    const snapshot = `${file}.deleting-${Date.now()}`;
    await this.fileOps.rename(file, snapshot);
    let indexCommitted = false;
    try {
      await this.writeJson(this.context.getProjectsPath(), {
        ...repo,
        workflows: (repo.workflows || []).filter((candidate) => candidate.id !== workflowId),
      });
      indexCommitted = true;
      try {
        await this.fileOps.rm(snapshot, { force: true });
      } catch (cleanupError) {
        useLogger()
          .logger()
          .error(
            `Workflow '${workflowId}' was deleted but tombstone cleanup failed:`,
            cleanupError,
          );
      }
    } catch (error) {
      if (!indexCommitted) await this.fileOps.rename(snapshot, file).catch((): void => undefined);
      throw new ReleasePersistenceError(
        `Unable to delete workflow '${workflowId}' without leaving stale references.`,
        error,
        "transaction-failed",
      );
    }
  }
}

export const getReleaseWorkflowPath = workflowPath;
