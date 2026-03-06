import { SaveLocationValidator } from '../save-location'
import { object, string, optional, record, InferInput, literal, array } from 'valibot'
import {
  createMigration,
  createMigrator,
  finalVersion,
  initialVersion,
  OmitVersion
} from '@pipelab/migration'

export const FileRepoValidatorV1 = object({
  version: literal('1.0.0'),
  data: optional(record(string(), SaveLocationValidator), {})
})

export const FileRepoProjectValidatorV2 = object({
  id: string(),
  name: string(),
  description: string()
})

export const FileRepoValidatorV2 = object({
  version: literal('2.0.0'),
  projects: array(FileRepoProjectValidatorV2),
  pipelines: optional(array(SaveLocationValidator), [])
})

export type FileRepoV1 = InferInput<typeof FileRepoValidatorV1>
export type FileRepoV2 = InferInput<typeof FileRepoValidatorV2>

export const FileRepoValidator = FileRepoValidatorV2
export type FileRepo = InferInput<typeof FileRepoValidator>

export const fileRepoMigrator = createMigrator<FileRepoV1, FileRepo>()

export const defaultFileRepo = fileRepoMigrator.createDefault({
  version: '2.0.0',
  projects: [
    {
      id: 'main',
      name: 'Default project',
      description: 'The initial default project'
    }
  ],
  pipelines: []
})

export const fileRepoMigrations = fileRepoMigrator.createMigrations({
  defaultValue: defaultFileRepo,
  migrations: [
    createMigration<never, FileRepoV1, FileRepoV2>({
      version: '1.0.0',
      up: (state) => {
        const pipelines: FileRepoV2['pipelines'] = Object.entries(state.data || {}).map(
          ([id, file]) => {
            return {
              ...file,
              id,
              project: 'main'
            }
          }
        )
        return {
          projects: [
            {
              id: 'main',
              name: 'Default project',
              description: 'The initial default project'
            }
          ],
          pipelines: pipelines
        } satisfies OmitVersion<FileRepoV2>
      },
      down: initialVersion
    }),
    createMigration<FileRepoV1, FileRepoV2, never>({
      version: '2.0.0',
      up: finalVersion,
      down: () => {
        throw new Error('Migration down not implemented')
      }
    })
  ]
})
