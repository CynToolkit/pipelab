import { MigratorConfig, Migrator, MigrationSchema } from './migration'

export const createMigrator = <
  InitialState extends MigrationSchema,
  FinalState extends MigrationSchema
>() => {
  return {
    createDefault(defaultState: InitialState): InitialState {
      return defaultState
    },
    createMigrations(config: MigratorConfig<InitialState, FinalState>): Migrator<InitialState, FinalState> {
      return new Migrator<InitialState, FinalState>(config)
    }
  }
}

export type MigratorFactory<
  InitialState extends MigrationSchema,
  FinalState extends MigrationSchema
> = ReturnType<typeof createMigrator<InitialState, FinalState>>
