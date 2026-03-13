import {
  createMigration,
  createMigrator,
  initialVersion,
  SemVer,
} from "./index";
import { 
  FileRepoV1, 
  FileRepoV2, 
  FileRepo 
} from "@pipelab/shared/src/config/projects";

export const fileRepoMigrator = createMigrator<FileRepoV1, FileRepo>();

export const defaultFileRepo = fileRepoMigrator.createDefault({
  version: "2.0.0" as SemVer,
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
      version: "1.0.0" as SemVer,
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
          version: "2.0.0" as SemVer,
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
    // ...
  ],
});
