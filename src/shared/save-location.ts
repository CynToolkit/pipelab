import { array, literal, object, string, union, type InferInput } from 'valibot'

export const SaveLocationInternalValidator = object({
  id: string(),
  project: string(),
  lastModified: string(),
  type: literal('internal'),
  configName: string()
})
export type SaveLocationInternal = InferInput<typeof SaveLocationInternalValidator>

export const SaveLocationExternalValidator = object({
  id: string(),
  project: string(),
  path: string(),
  lastModified: string(),
  type: literal('external'),
  summary: object({
    plugins: array(string()),
    name: string(),
    description: string()
  })
})
export type SaveLocationExternal = InferInput<typeof SaveLocationExternalValidator>

export const SaveLocationPipelabCloudValidator = object({
  id: string(),
  project: string(),
  type: literal('pipelab-cloud')
})

export type SaveLocationPipelabCloud = InferInput<typeof SaveLocationPipelabCloudValidator>

export const SaveLocationValidator = union([
  SaveLocationExternalValidator,
  SaveLocationInternalValidator,
  SaveLocationPipelabCloudValidator
])

export type SaveLocation = InferInput<typeof SaveLocationValidator>
