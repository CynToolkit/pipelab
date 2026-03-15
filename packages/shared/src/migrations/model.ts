import {
  createMigration,
  createMigrator,
  finalVersion,
  initialVersion,
  OmitVersion,
  SemVer,
} from "@pipelab/migration";
import {
  SavedFileV1,
  SavedFileV2,
  SavedFileV3,
  SavedFileV4,
  SavedFile,
} from "../model-definition";

const savedFileMigratorr = createMigrator<SavedFileV1, SavedFile>();
const defaultValue = savedFileMigratorr.createDefault({
  canvas: {
    triggers: [],
    blocks: [],
  },
  description: "",
  name: "",
  variables: [],
  type: "default",
  version: "4.0.0" as SemVer,
});

export const savedFileMigrator = savedFileMigratorr.createMigrations({
  defaultValue,
  migrations: [
    createMigration<never, SavedFileV1, SavedFileV2>({
      version: "1.0.0" as SemVer,
      up: (state) => {
        const blocks = state.canvas.blocks;

        const triggers: any[] = [];
        const newBlocks: any[] = [];

        for (const block of blocks) {
          if (block.type === "event") {
            triggers.push(block);
          } else {
            newBlocks.push(block);
          }
        }

        return {
          canvas: {
            blocks: newBlocks,
            triggers: triggers,
          },
          description: state.description,
          name: state.name,
          variables: state.variables,
        } as any;
      },
      down: initialVersion,
    }),
    createMigration<SavedFileV1, SavedFileV2, SavedFileV3>({
      version: "2.0.0" as SemVer,
      up: (state) => {
        const { canvas, ...rest } = state;
        const { blocks, triggers } = canvas;

        const newBlocks: any[] = [];

        for (const block of blocks) {
          const newParams: any = {};

          for (const data of Object.entries(block.params)) {
            if (data === undefined) {
              throw new Error("Can't migrate block with undefined params");
            } else {
              const [key, value] = data;
              newParams[key] = {
                editor: "editor",
                value,
              };
            }
          }

          newBlocks.push({
            ...block,
            params: newParams,
          });
        }

        return {
          ...rest,
          canvas: {
            triggers,
            blocks: newBlocks,
          },
        } as any;
      },
      down: () => {
        throw new Error("Migration down not implemented");
      },
    }),
    createMigration<SavedFileV2, SavedFileV3, SavedFileV4>({
      version: "3.0.0" as SemVer,
      up: (state) => {
        return {
          ...state,
          type: "default",
        } as any;
      },
      down: () => {
        throw new Error("Migration down not implemented");
      },
    }),
    createMigration<SavedFileV3, SavedFileV4, SavedFileV4>({
      version: "4.0.0" as SemVer,
      up: finalVersion,
      down: () => {
        throw new Error("Migration down not implemented");
      },
    }),
  ],
});
