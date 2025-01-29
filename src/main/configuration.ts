import { createConfig } from '@renderer/utils/config'
import { string, InferInput, union, literal } from 'valibot'
import { createVersionSchema } from '@@/libs/migration/models/migration'

export const AppSettingsValidator = createVersionSchema({
  cacheFolder: string(),
  theme: union([literal('light'), literal('dark')])
})

export type AppConfig = InferInput<typeof AppSettingsValidator>

export const defaultAppSettings = {
  cacheFolder: '/tmp',
  theme: 'light',
  version: '1.0.0'
} satisfies AppConfig

export const useAppSettings = () => {
  const { load: _load, save: _save } = createConfig<Record<string, File>>('settings')

  const jsonToRef = (data: unknown) => {
    //
  }

  const load = async () => {
    const data = await _load()

    if (data.type === 'success') {
      return data.result.result
    } else {
      throw new Error('Failed to load settings')
    }
  }

  const save = (data: Record<string, File>) => {
    return _save(data)
  }

  return {
    save,
    load
  }
}
