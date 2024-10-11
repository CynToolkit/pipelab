import {
  MigrationFn,
  MigrationObjInput,
  MigrationClass,
  MigrationSchema,
  OmitVersion,
  SemVer
} from './migration'

export function createMigration<
  Down extends MigrationSchema,
  Current extends MigrationSchema,
  Up extends MigrationSchema
>(migration: MigrationObjInput<Down, Current, Up>): MigrationClass<Down, Current, Up> {
  return {
    version: migration.version,
    up: async (state, nextVersion) => {
      console.log('createMigration state', state)
      console.log('createMigration nextVersion', nextVersion)
      const newState = (await migration.up(state, nextVersion)) as unknown as Up
      newState.version = nextVersion as SemVer
      return newState
    },
    down: async (state, nextVersion) => {
      const newState = (await migration.down(state, nextVersion)) as unknown as Down
      newState.version = nextVersion as SemVer
      return newState
    }
  }
}

export const initialVersion = () => {
  throw new Error('Unable to go down on the initial version!')
}

export const finalVersion = () => {
  throw new Error('Unable to go up on the final version!')
}

/**
 * @deprecated
 * @param version
 * @param migration
 * @returns
 */
export function initial<Current extends MigrationSchema, Up extends MigrationSchema>(
  version: SemVer,
  migration: MigrationFn<OmitVersion<Current>, OmitVersion<Up>>
): MigrationClass<Current, Current, Up> {
  return createMigration({
    version,
    up: migration,
    down() {
      throw new Error('Unable to go down on the initial version!')
    }
  })
}

export function final<Current extends MigrationSchema, Down extends MigrationSchema>(
  version: SemVer,
  migration: MigrationFn<OmitVersion<Current>, OmitVersion<Down>>
): MigrationClass<Down, Current, Current> {
  return createMigration({
    version,
    up: () => {
      throw new Error(`Unable to go up on the final version "${version}"!`)
    },
    down: migration
  })
}
