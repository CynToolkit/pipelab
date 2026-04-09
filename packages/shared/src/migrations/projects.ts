import { createMigration, createMigrator, initialVersion, finalVersion } from "@pipelab/migration";
import { FileRepoV1, FileRepoV2, FileRepo } from "../config/projects";

export const fileRepoMigrator = createMigrator<FileRepoV1, FileRepo>();

export const defaultFileRepo = fileRepoMigrator.createDefault({
  version: "2.0.0",
  projects: [
    {
      id: "main",
      name: "Default project",
      description: "The initial default project",
    },
  ],
  pipelines: [],
});

export const fileRepoMigrations = fileRepoMigrator.createMigrations({
  defaultValue: defaultFileRepo,
  migrations: [
    createMigration<never, FileRepoV1, FileRepoV2>({
      version: "1.0.0",
      up: (state) => {
        const pipelines: FileRepoV2["pipelines"] = Object.entries(state.data || {}).map(
          ([id, file]) => {
            return {
              ...file,
              id,
              project: "main",
            };
          },
        );
        return {
          version: "2.0.0",
          projects: [
            {
              id: "main",
              name: "Default project",
              description: "The initial default project",
            },
          ],
          pipelines: pipelines,
        } as any;
      },
      down: initialVersion,
    }),
    createMigration<FileRepoV1, FileRepoV2, never>({
      version: "2.0.0",
      up: finalVersion,
      down: (state) => {
        throw new Error("Cannot downgrade to version 1.0.0");
      },
    }),
  ],
});
