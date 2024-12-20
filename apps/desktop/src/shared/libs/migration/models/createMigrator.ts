import { MigratorConfig, Migrator, MigrationSchema } from './migration';

// eslint-disable-next-line import/prefer-default-export
export function createMigrator<FinalState extends MigrationSchema>(config: MigratorConfig) {
  const migrator = new Migrator<FinalState>(config);
  return migrator;
}
