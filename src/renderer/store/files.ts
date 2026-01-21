import { SavedFile } from '@@/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Draft, create } from 'mutative'
import { createConfig } from '@renderer/utils/config'
import { klona } from 'klona'
import { SaveLocationValidator } from '@@/save-location'
import {
  object,
  string,
  optional,
  record,
  InferInput,
  parse,
  ValiError,
  literal,
  array
} from 'valibot'
import { createMigration, createMigrator, finalVersion, initialVersion } from '@@/libs/migration'
import { OmitVersion } from '@@/libs/migration/models/migration'

export interface File {
  data: SavedFile
}

export const FileRepoValidatorV1 = object({
  version: literal('1.0.0'),
  data: optional(record(string(), SaveLocationValidator), {})
})

// ---

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
const defaultValue = fileRepoMigrator.createDefault({
  version: '2.0.0',
  // a default project with no files
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
  defaultValue,
  migrations: [
    createMigration<never, FileRepoV1, FileRepoV2>({
      version: '1.0.0',
      up: (state) => {
        // on V1, there are no projects, just a data record
        // we put everything on a main single project

        const pipelines: FileRepoV2['pipelines'] = Object.entries(state.data).map(([id, file]) => {
          return {
            id,
            project: defaultValue.projects[0].id, // all go to the main project
            ...file
          }
        })
        return {
          projects: defaultValue.projects,
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

export const useFile = (name: string) => {
  // const file = ref<File>()

  const { load, save } = createConfig<Record<string, File>>(name)

  return {
    save,
    load
  }
}

export const useFiles = defineStore('files', () => {
  const files = ref<FileRepo>(defaultValue)

  const {
    load: loadConfig,
    save: saveConfig,
    backup: backupConfig
  } = createConfig<FileRepo>('projects')

  const update = async (callback: (state: Draft<FileRepo>) => void) => {
    files.value = create(files.value, callback)
    console.log('files.value', files.value)
    await saveConfig(klona(files.value))
  }

  const load = async () => {
    const data = await loadConfig()

    if (data.type === 'success') {
      if (fileRepoMigrations.needMigration(data.result.result.version)) {
        console.log('backing up')
        backupConfig(data.result.result.version)
      }
      try {
        const filerepo = await fileRepoMigrations.migrate(data.result.result)
        console.log('filerepo', filerepo)
        files.value = filerepo
      } catch (e) {
        if (e instanceof ValiError) {
          console.log('error', e.issues)
        }
        console.error('error', e)
        files.value = defaultValue
      }
    } else {
      files.value = defaultValue
    }
  }

  const remove = async (id: string) => {
    update((state) => {
      state.pipelines = state.pipelines.filter((file) => file.id !== id)
    })
  }

  const loadFile = (name: string) => {
    const { load, save } = createConfig<Record<string, File>>(name)
    return {
      load,
      save
    }
  }

  return {
    files: files,
    // files: readonly(files),

    load,
    loadFile,
    update,
    remove
  }
})
