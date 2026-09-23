import {
  defaultConnections,
  defaultFileRepo,
  fileRepoMigrations,
  parseConnectionsConfig,
  parseFileRepo,
  type ConnectionsConfig,
  type FileRepo,
} from "@pipelab/shared";
import { PipelabContext } from "./context";
import { JsonFileMissingError, readJsonFile, writeJsonFileAtomically } from "./utils/atomic-json";

const migratedProject = async (raw: unknown): Promise<FileRepo> => {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    typeof (raw as Record<string, unknown>).version !== "string"
  )
    throw new Error("Project index is malformed.");
  return parseFileRepo(
    await fileRepoMigrations.migrate(raw as { version: `${number}.${number}.${number}` }, {
      debug: false,
    }),
  );
};

export const loadStrictProjects = async (context: PipelabContext): Promise<FileRepo> => {
  try {
    return await migratedProject(await readJsonFile(context.getProjectsPath()));
  } catch (error) {
    if (error instanceof JsonFileMissingError) {
      await writeJsonFileAtomically(context.getProjectsPath(), defaultFileRepo);
      return defaultFileRepo;
    }
    throw error;
  }
};

export const saveStrictProjects = async (
  context: PipelabContext,
  value: FileRepo,
): Promise<void> => {
  const next = parseFileRepo(value);
  const current = await loadStrictProjects(context);
  for (const workflow of current.workflows || [])
    if (!next.projects.some((project) => project.id === workflow.project))
      throw new Error(
        `Project '${workflow.project}' cannot be deleted while workflow '${workflow.id}' references it.`,
      );
  if (JSON.stringify(current.workflows || []) !== JSON.stringify(next.workflows || []))
    throw new Error("Workflow index entries can only be changed through ReleasePersistence.");
  await writeJsonFileAtomically(context.getProjectsPath(), next);
};

export const loadStrictConnections = async (
  context: PipelabContext,
): Promise<ConnectionsConfig> => {
  try {
    return parseConnectionsConfig(await readJsonFile(context.getConnectionsPath()));
  } catch (error) {
    if (error instanceof JsonFileMissingError) {
      await writeJsonFileAtomically(context.getConnectionsPath(), defaultConnections);
      return defaultConnections;
    }
    throw error;
  }
};

export const saveStrictConnections = async (
  context: PipelabContext,
  value: ConnectionsConfig,
): Promise<void> => {
  await writeJsonFileAtomically(context.getConnectionsPath(), parseConnectionsConfig(value));
};
