import {
  defaultConnections,
  defaultFileRepo,
  fileRepoMigrations,
  parseVersionedFileRepo,
  parseConnectionsConfig,
  parseFileRepo,
  type ConnectionsConfig,
  type FileRepo,
} from "@pipelab/shared";
import { PipelabContext } from "./context";
import {
  JsonFileMissingError,
  readJsonFile,
  writeJsonFileAtomically,
  writeJsonFileAtomicallyIfMissing,
} from "./utils/atomic-json";
import { serializeFileMutation } from "./release-persistence-lock";

const migratedProject = async (raw: unknown): Promise<FileRepo> => {
  const versioned = parseVersionedFileRepo(raw);
  if (versioned.version === "3.0.0") return parseFileRepo(versioned);
  return parseFileRepo(await fileRepoMigrations.migrate(versioned, { debug: false }));
};

export const loadStrictProjects = async (context: PipelabContext): Promise<FileRepo> => {
  try {
    return await migratedProject(await readJsonFile(context.getProjectsPath()));
  } catch (error) {
    if (error instanceof JsonFileMissingError) {
      const created = await writeJsonFileAtomicallyIfMissing(
        context.getProjectsPath(),
        defaultFileRepo,
      );
      if (created) return defaultFileRepo;
      return migratedProject(await readJsonFile(context.getProjectsPath()));
    }
    throw error;
  }
};

export const saveStrictProjects = async (
  context: PipelabContext,
  value: FileRepo,
): Promise<void> => {
  await serializeFileMutation(context.getProjectsPath(), async () => {
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
  });
};

export const loadStrictConnections = async (
  context: PipelabContext,
): Promise<ConnectionsConfig> => {
  try {
    return parseConnectionsConfig(await readJsonFile(context.getConnectionsPath()));
  } catch (error) {
    if (error instanceof JsonFileMissingError) {
      const created = await writeJsonFileAtomicallyIfMissing(
        context.getConnectionsPath(),
        defaultConnections,
      );
      if (created) return defaultConnections;
      return parseConnectionsConfig(await readJsonFile(context.getConnectionsPath()));
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
