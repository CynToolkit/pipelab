import {
  MigrationFn,
  MigrationObjInput,
  MigrationClass,
  MigrationSchema,
  OmitVersion,
  SemVer,
} from "./migration";

export function createMigration<
  Current extends MigrationSchema,
  Up extends MigrationSchema,
>(migration: MigrationObjInput<Current, Up>): MigrationClass<Current, Up> {
  return {
    version: migration.version,
    up: async (state, nextVersion) => {
      const newState = migration.up
        ? ((await migration.up(state, nextVersion)) as unknown as Up)
        : (state as unknown as Up);
      newState.version = nextVersion as SemVer;
      return newState;
    },
  };
}

export const finalVersion = () => {
  throw new Error("Unable to go up on the final version!");
};

