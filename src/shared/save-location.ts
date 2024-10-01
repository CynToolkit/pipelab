export interface SaveLocationInternal {
  path: string
  lastModified: string
  type: 'internal'
  configName: string
}

export interface SaveLocationExternal {
  path: string
  lastModified: string
  type: 'external'
  summary: {
    plugins: string[]
    name: string
    description: string
  }
}

export interface SaveLocationPipelabCloud {
  type: 'pipelab-cloud'
  // TODO
}

export type SaveLocation =
  // | SaveLocationInternal
  SaveLocationExternal | SaveLocationPipelabCloud
